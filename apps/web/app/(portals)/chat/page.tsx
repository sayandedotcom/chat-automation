"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import { PlanetaryBackground } from "@/components/planetary-background";
import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { StarsBackground } from "@workspace/ui/components/stars-background";
import { ChatGreeting } from "@/components/chat-greeting";
import { ChatInputWithMentions } from "@/components/chat-input";
import { WorkflowTimeline, WorkflowStep } from "@/components/workflow-timeline";

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const SESSION_STORAGE_PREFIX = "chat_session_";

interface PersistedSession {
  threadId: string;
  completedTurns: ConversationTurn[];
  currentTurn: {
    userMessage: string;
    steps: WorkflowStep[];
    planThinking: string | null;
    statusMessages: Array<{ text: string; icon?: string; type?: string }>;
    loadedIntegrations: IntegrationInfo[];
    workflowStatus: WorkflowStatus;
    error: string | null;
  } | null;
}

type WorkflowStatus = "idle" | "planning" | "executing" | "complete" | "error";

interface IntegrationInfo {
  name: string;
  display_name: string;
  tools_count: number;
  icon: string;
}

interface ConversationTurn {
  id: string;
  userMessage: string;
  steps: WorkflowStep[];
  planThinking: string | null;
  statusMessages: Array<{ text: string; icon?: string; type?: string }>;
  loadedIntegrations: IntegrationInfo[];
  error: string | null;
}

export default function ChatPage() {
  const { user } = useAuth();
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("idle");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [originalRequest, setOriginalRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planThinking, setPlanThinking] = useState<string | null>(null);
  const [statusMessages, setStatusMessages] = useState<
    Array<{ text: string; icon?: string; type?: string }>
  >([]);
  const [loadedIntegrations, setLoadedIntegrations] = useState<
    IntegrationInfo[]
  >([]);
  const threadIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Multi-turn: completed previous turns
  const [completedTurns, setCompletedTurns] = useState<ConversationTurn[]>([]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [completedTurns.length, steps, workflowStatus]);

  // Restore session from URL param + sessionStorage on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlThreadId = params.get("t");
    if (!urlThreadId) return;

    try {
      const raw = sessionStorage.getItem(SESSION_STORAGE_PREFIX + urlThreadId);
      if (!raw) return;

      const session: PersistedSession = JSON.parse(raw);
      threadIdRef.current = session.threadId;
      setCompletedTurns(session.completedTurns);

      if (session.currentTurn) {
        setOriginalRequest(session.currentTurn.userMessage);
        setSteps(session.currentTurn.steps);
        setPlanThinking(session.currentTurn.planThinking);
        setStatusMessages(session.currentTurn.statusMessages);
        setLoadedIntegrations(session.currentTurn.loadedIntegrations);
        setWorkflowStatus(session.currentTurn.workflowStatus);
        setError(session.currentTurn.error);
      }
    } catch {
      // Corrupted storage — ignore
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist session to sessionStorage when a workflow completes or turns are archived
  useEffect(() => {
    const tid = threadIdRef.current;
    if (!tid) return;
    // Only persist when there's something meaningful to save
    if (workflowStatus !== "complete" && completedTurns.length === 0) return;

    const session: PersistedSession = {
      threadId: tid,
      completedTurns,
      currentTurn:
        workflowStatus === "complete" || workflowStatus === "error"
          ? {
              userMessage: originalRequest,
              steps,
              planThinking,
              statusMessages,
              loadedIntegrations,
              workflowStatus,
              error,
            }
          : null,
    };

    try {
      sessionStorage.setItem(
        SESSION_STORAGE_PREFIX + tid,
        JSON.stringify(session),
      );
    } catch {
      // Storage full — ignore
    }
  }, [
    workflowStatus,
    completedTurns,
    originalRequest,
    steps,
    planThinking,
    statusMessages,
    loadedIntegrations,
    error,
  ]);

  const executeWorkflow = useCallback(
    async (request: string) => {
      // Archive the current completed turn before starting a new one
      if (workflowStatus === "complete" && steps.length > 0) {
        setCompletedTurns((prev) => [
          ...prev,
          {
            id: generateId(),
            userMessage: originalRequest,
            steps: [...steps],
            planThinking,
            statusMessages: [...statusMessages],
            loadedIntegrations: [...loadedIntegrations],
            error: null,
          },
        ]);
      }

      // Reset current turn state (but NOT threadIdRef — keep the same thread)
      setOriginalRequest(request);
      setWorkflowStatus("planning");
      setSteps([]);
      setCurrentStep(0);
      setError(null);
      setPlanThinking(null);
      setStatusMessages([]);
      setLoadedIntegrations([]);

      try {
        // Use streaming endpoint for real-time updates
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            request,
            thread_id: threadIdRef.current,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to start workflow");
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                console.log("📥 SSE RECEIVED:", data.type, data);
                handleStreamEvent(data);
              } catch (e) {
                // Ignore parse errors for incomplete JSON
                console.log("⚠️ Failed to parse SSE:", line);
              }
            }
          }
        }

        // Note: Don't set workflowStatus to complete here
        // The status is managed by handleStreamEvent based on actual events
        // This allows the workflow to stay in "executing" state while waiting for approval
      } catch (err) {
        console.error("Workflow error:", err);
        setError(err instanceof Error ? err.message : "Workflow failed");
        setWorkflowStatus("error");
      }
    },
    [
      workflowStatus,
      steps,
      originalRequest,
      planThinking,
      statusMessages,
      loadedIntegrations,
    ],
  );

  const handleStreamEvent = (event: {
    type: string;
    thread_id?: string;
    current_step?: number;
    total_steps?: number;
    content?: string; // For thinking event
    duration_hint?: number; // For thinking event
    plan?: {
      thinking?: string; // AI reasoning from planner
      steps: Array<{
        step_number: number;
        description: string;
        status: string;
        tools_used?: string[];
        result?: string;
        requires_human_approval?: boolean;
        approval_reason?: string;
        thinking?: string; // Per-step thinking
        thinking_duration_ms?: number;
      }>;
      is_complete?: boolean;
    };
    message?: string;
    interrupt?: {
      type: string;
      step_number: number;
      description: string;
      reason?: string;
      preview?: Record<string, unknown>;
      actions?: string[];
    };
    // Integration events
    integrations?: IntegrationInfo[];
    tool_count?: number;
    // Incremental loading
    integration?: string;
    display_name?: string;
    tools_added?: number;
    triggered_by?: string;
    // Step thinking
    step_number?: number;
    thinking?: string;
    duration_ms?: number;
  }) => {
    switch (event.type) {
      case "integrations_ready":
        // Handle integration loading complete
        if (event.integrations) {
          setLoadedIntegrations(event.integrations);
        }
        if (event.message) {
          setStatusMessages((prev) => [
            ...prev,
            {
              text: event.message!,
              icon: "check",
              type: "integration",
            },
          ]);
        }
        break;

      case "integration_added_incrementally":
        // Handle incremental loading
        if (event.integration) {
          setLoadedIntegrations((prev) => [
            ...prev,
            {
              name: event.integration!,
              display_name: event.display_name || event.integration!,
              tools_count: event.tools_added || 0,
              icon: event.integration!,
            },
          ]);
        }
        if (event.message) {
          setStatusMessages((prev) => [
            ...prev,
            {
              text: event.message!,
              icon: "plus",
              type: "incremental",
            },
          ]);
        }
        break;

      case "step_thinking":
        // Handle per-step thinking events
        if (event.step_number) {
          setSteps((prev) =>
            prev.map((step) =>
              step.step_number === event.step_number
                ? {
                    ...step,
                    thinking: event.thinking,
                    thinking_duration_ms: event.duration_ms,
                  }
                : step,
            ),
          );
        }
        break;

      case "token":
        // Handle streaming tokens from LLM
        if (event.step_number && event.content) {
          setSteps((prev) =>
            prev.map((step) =>
              step.step_number === event.step_number
                ? {
                    ...step,
                    result: (step.result || "") + event.content,
                  }
                : step,
            ),
          );
        }
        break;

      case "thinking":
        // Store the AI's thinking content to display in the timeline
        if (event.content) {
          setPlanThinking(event.content);
        }
        break;

      case "progress":
        if (event.thread_id) {
          threadIdRef.current = event.thread_id;
          // Persist thread_id in URL so it survives page reload
          const url = new URL(window.location.href);
          if (url.searchParams.get("t") !== event.thread_id) {
            url.searchParams.set("t", event.thread_id);
            window.history.replaceState(null, "", url.toString());
          }
        }

        // Extract thinking from plan if available
        if (event.plan?.thinking && !planThinking) {
          setPlanThinking(event.plan.thinking);
        }

        if (event.plan?.steps) {
          setSteps((prev) => {
            // Merge step data, preserving pending_approval status that was set locally
            return event.plan!.steps.map((s) => {
              const existingStep = prev.find(
                (p) => p.step_number === s.step_number,
              );
              // If we locally marked a step as awaiting_approval, keep that
              const preserveApproval =
                existingStep?.status === "awaiting_approval";
              return {
                step_number: s.step_number,
                description: s.description,
                // Use awaiting_approval from backend OR preserve local awaiting_approval
                status: (preserveApproval
                  ? "awaiting_approval"
                  : s.status) as WorkflowStep["status"],
                tools_used: s.tools_used,
                result: s.result,
                requires_human_approval: s.requires_human_approval,
                approval_reason: s.approval_reason,
                // Per-step thinking
                thinking: s.thinking || existingStep?.thinking,
                thinking_duration_ms:
                  s.thinking_duration_ms || existingStep?.thinking_duration_ms,
              };
            });
          });
          setWorkflowStatus("executing");
        }

        if (event.current_step !== undefined) {
          setCurrentStep(event.current_step);
        }

        if (event.plan?.is_complete) {
          setWorkflowStatus("complete");
        }
        break;

      case "error":
        setError(event.message || "Unknown error");
        setWorkflowStatus("error");
        // Mark current step as failed
        setSteps((prev) =>
          prev.map((step, idx) =>
            idx === currentStep
              ? { ...step, status: "failed", error: event.message }
              : step,
          ),
        );
        break;

      case "done":
        setWorkflowStatus("complete");
        break;

      case "approval_required":
        // Workflow is paused waiting for approval
        console.log("🔐 Received approval_required event:", event);
        if (event.thread_id) {
          threadIdRef.current = event.thread_id;
          const approvalUrl = new URL(window.location.href);
          if (approvalUrl.searchParams.get("t") !== event.thread_id) {
            approvalUrl.searchParams.set("t", event.thread_id);
            window.history.replaceState(null, "", approvalUrl.toString());
          }
        }
        // Update the step status to pending_approval
        if (event.interrupt?.step_number) {
          console.log(
            "📝 Updating step",
            event.interrupt.step_number,
            "to pending_approval",
          );
          setSteps((prev) =>
            prev.map((step) =>
              step.step_number === event.interrupt!.step_number
                ? {
                    ...step,
                    status: "awaiting_approval" as const,
                    approval_reason: event.interrupt!.reason,
                    preview: event.interrupt!.preview,
                  }
                : step,
            ),
          );
          setCurrentStep(event.interrupt.step_number - 1);
        }
        // Stop workflow execution - don't mark as complete
        setWorkflowStatus("executing");
        break;
    }
  };

  const handleRetry = useCallback(async (stepNumber: number) => {
    // Reset the failed step and subsequent steps
    setSteps((prev) =>
      prev.map((step) =>
        step.step_number >= stepNumber
          ? { ...step, status: "pending", error: undefined }
          : step,
      ),
    );
    setCurrentStep(stepNumber - 1);
    setWorkflowStatus("executing");
    setError(null);

    // Call the retry endpoint
    try {
      const response = await fetch("/api/chat/retry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          thread_id: threadIdRef.current,
          step_number: stepNumber,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to retry workflow");
      }

      const data = await response.json();

      if (data.plan?.steps) {
        setSteps(
          data.plan.steps.map(
            (s: {
              step_number: number;
              description: string;
              status: string;
              result?: string;
            }) => ({
              step_number: s.step_number,
              description: s.description,
              status: s.status as WorkflowStep["status"],
              result: s.result,
            }),
          ),
        );
      }

      if (data.is_complete) {
        setWorkflowStatus("complete");
      }
    } catch (err) {
      console.error("Retry error:", err);
      setError(err instanceof Error ? err.message : "Retry failed");
      setWorkflowStatus("error");
    }
  }, []);

  const handleApprove = useCallback(
    async (
      stepNumber: number,
      action: "approve" | "edit" | "skip",
      content?: Record<string, unknown>,
    ) => {
      try {
        // First update UI optimistically
        setSteps((prev) =>
          prev.map((step) =>
            step.step_number === stepNumber
              ? {
                  ...step,
                  status: action === "skip" ? "completed" : "in_progress",
                }
              : step,
          ),
        );

        // Call the resume endpoint
        const response = await fetch("/api/chat/resume", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            thread_id: threadIdRef.current,
            action,
            content: action === "edit" ? content : undefined,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to resume workflow");
        }

        const data = await response.json();

        // Update steps from response
        if (data.plan?.steps) {
          setSteps(
            data.plan.steps.map(
              (s: {
                step_number: number;
                description: string;
                status: string;
                result?: string;
                tools_used?: string[];
                requires_human_approval?: boolean;
                approval_reason?: string;
              }) => ({
                step_number: s.step_number,
                description: s.description,
                status: s.status as WorkflowStep["status"],
                result: s.result,
                tools_used: s.tools_used,
                requires_human_approval: s.requires_human_approval,
                approval_reason: s.approval_reason,
              }),
            ),
          );
        }

        if (data.is_complete) {
          setWorkflowStatus("complete");
        }
      } catch (err) {
        console.error("Approval error:", err);
        setError(err instanceof Error ? err.message : "Approval failed");
        // Revert the step status
        setSteps((prev) =>
          prev.map((step) =>
            step.step_number === stepNumber
              ? { ...step, status: "awaiting_approval" as const }
              : step,
          ),
        );
      }
    },
    [],
  );

  const handleNewWorkflow = useCallback(() => {
    // Clear persisted session
    if (threadIdRef.current) {
      sessionStorage.removeItem(SESSION_STORAGE_PREFIX + threadIdRef.current);
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("t");
    window.history.replaceState(null, "", url.toString());

    setCompletedTurns([]);
    setWorkflowStatus("idle");
    setSteps([]);
    setCurrentStep(0);
    setOriginalRequest("");
    setError(null);
    setPlanThinking(null);
    setStatusMessages([]);
    setLoadedIntegrations([]);
    threadIdRef.current = null;
  }, []);

  const isIdle = workflowStatus === "idle";
  const isChatActive = !isIdle;

  // Wrapper that conditionally shows background or solid black
  const ContentWrapper = ({ children }: { children: React.ReactNode }) => {
    if (isChatActive) {
      // Solid black background when chat is active - fixed height container
      return (
        <div className="h-screen w-full bg-[#0a0a0a] flex flex-col overflow-hidden">
          {children}
        </div>
      );
    }
    // Show planetary background when idle
    return (
      <PlanetaryBackground
        backgroundContent={
          <>
            <ShootingStars />
            <StarsBackground />
          </>
        }
      >
        {children}
      </PlanetaryBackground>
    );
  };

  return (
    <ContentWrapper>
      <div className="flex flex-col w-full h-full z-10 relative">
        {/* Idle state - show greeting and input */}
        {isIdle && (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <ChatGreeting
              userName={user?.name?.split(" ")[0] || "there"}
              subtitle="Describe your workflow and I'll execute it step by step"
            />
            <ChatInputWithMentions
              onSubmit={executeWorkflow}
              placeholder="e.g., Research the best auth services, create a Notion doc with findings..."
            />
          </div>
        )}

        {/* Chat/Workflow in progress or complete */}
        {isChatActive && (
          <>
            {/* Scrollable content area - takes remaining space */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 pt-6 pb-4"
            >
              <div className="max-w-3xl mx-auto space-y-6">
                {/* Completed previous turns */}
                {completedTurns.map((turn) => (
                  <div key={turn.id} className="space-y-4">
                    {/* Previous turn: user message bubble */}
                    <div className="flex justify-end">
                      <div className="bg-[#1f1f1f] rounded-2xl px-4 py-3 max-w-md">
                        <p className="text-white/90 text-sm">
                          {turn.userMessage}
                        </p>
                      </div>
                    </div>

                    {/* Previous turn: completed workflow timeline */}
                    <WorkflowTimeline
                      steps={turn.steps}
                      currentStep={turn.steps.length}
                      planThinking={turn.planThinking || undefined}
                      statusMessages={turn.statusMessages}
                      loadedIntegrations={turn.loadedIntegrations}
                      isComplete={true}
                    />
                  </div>
                ))}

                {/* Current turn: user message bubble */}
                <div className="flex justify-end">
                  <div className="bg-[#1f1f1f] rounded-2xl px-4 py-3 max-w-md">
                    <p className="text-white/90 text-sm">{originalRequest}</p>
                  </div>
                </div>

                {/* Current turn: active workflow timeline */}
                <WorkflowTimeline
                  steps={steps}
                  currentStep={currentStep}
                  planThinking={planThinking || undefined}
                  statusMessages={statusMessages}
                  loadedIntegrations={loadedIntegrations}
                  onRetry={handleRetry}
                  onApprove={handleApprove}
                  isComplete={workflowStatus === "complete"}
                />

                {/* Error display */}
                {error && (
                  <div className="flex items-start gap-4">
                    <div className="w-2 h-2 mt-2 rounded-full bg-red-400 flex-shrink-0" />
                    <div className="rounded-2xl bg-[#1a1a1a] border border-red-500/30 px-4 py-3">
                      <p className="text-red-400 text-sm">
                        <strong>Error:</strong> {error}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fixed chat input at the bottom */}
            <div className="flex-shrink-0 px-4 pb-6 pt-2 bg-[#0a0a0a] border-t border-white/5">
              <ChatInputWithMentions
                onSubmit={executeWorkflow}
                placeholder={
                  workflowStatus === "complete"
                    ? "Send a follow-up message..."
                    : "Send a message..."
                }
              />
            </div>
          </>
        )}
      </div>
    </ContentWrapper>
  );
}
