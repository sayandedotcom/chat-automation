"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Image from "next/image";

import { useMutation } from "@tanstack/react-query";

import ShimmerText from "@workspace/ui/components/kokonutui/shimmer-text";
import { MarkdownRenderer } from "@workspace/ui/components/tiptap-markdown-renderer";

import { ChatGreeting } from "@/components/chat-greeting";
import { ChatInputWithMentions } from "@/components/chat-input";
import { WorkflowStep, WorkflowTimeline } from "@/components/workflow-timeline";

import { useSession } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";

import { integrations as integrationConfig } from "@/config/integrations";

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
  const { data: session } = useSession();
  const user = session?.user;
  const trpc = useTRPC();
  const retryMutation = useMutation(trpc.chat.retry.mutationOptions());
  const resumeMutation = useMutation(trpc.chat.resume.mutationOptions());
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("idle");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [originalRequest, setOriginalRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [planThinking, setPlanThinking] = useState<string | null>(null);
  const [statusMessages, setStatusMessages] = useState<
    Array<{ text: string; icon?: string; type?: string }>
  >([]);
  const [loadedIntegrations, setLoadedIntegrations] = useState<IntegrationInfo[]>([]);
  const [authRequired, setAuthRequired] = useState<Array<{
    mcp_server: string;
    display_name: string;
    icon: string;
    connect_id: string;
  }> | null>(null);
  const threadIdRef = useRef<string | null>(null);
  // Multi-turn: completed previous turns
  const [completedTurns, setCompletedTurns] = useState<ConversationTurn[]>([]);

  // Scroll control
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentTurnRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Auto-scroll to bottom when content changes (only when enabled)
  useEffect(() => {
    if (autoScrollRef.current && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        const el = scrollContainerRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      });
    }
  }, [steps, planThinking, statusMessages, loadedIntegrations, workflowStatus, originalRequest]);

  // Detect user scroll: re-enable auto-scroll when user reaches bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    autoScrollRef.current = isNearBottom;
  }, []);

  // After follow-up: scroll user message to top of viewport instantly
  useEffect(() => {
    if (
      workflowStatus === "planning" &&
      completedTurns.length > 0 &&
      currentTurnRef.current &&
      scrollContainerRef.current
    ) {
      autoScrollRef.current = false;
      requestAnimationFrame(() => {
        const scrollEl = scrollContainerRef.current;
        const turnEl = currentTurnRef.current;
        if (!scrollEl || !turnEl) return;
        // Match the initial message's pt-6 (24px) offset from scroll container top
        const turnRect = turnEl.getBoundingClientRect();
        const scrollRect = scrollEl.getBoundingClientRect();
        const targetScrollTop = turnRect.top - scrollRect.top + scrollEl.scrollTop - 24;
        scrollEl.scrollTop = targetScrollTop;
        // The programmatic scroll triggers handleScroll which may set autoScrollRef=true
        // (because content fits in viewport → isNearBottom=true). Reset after scroll event.
        requestAnimationFrame(() => {
          autoScrollRef.current = false;
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalRequest]);

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
  }, []);

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
      sessionStorage.setItem(SESSION_STORAGE_PREFIX + tid, JSON.stringify(session));
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
        // Disable auto-scroll immediately so the auto-scroll effect won't fight the follow-up scroll
        autoScrollRef.current = false;
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
      setAuthRequired(null);

      try {
        // Use streaming endpoint for real-time updates
        const apiUrl = process.env.NEXT_PUBLIC_API_URL as string;
        const response = await fetch(`${apiUrl}/chat/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
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

        let eventCount = 0;
        let lastEventType = "";
        let lastEventTime = Date.now();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(
              `🔚 [SSE] Stream ended (reader.done=true). Total events: ${eventCount}, last event: "${lastEventType}", buffer remaining: "${buffer.slice(0, 200)}"`
            );
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                eventCount++;
                const now = Date.now();
                const gap = now - lastEventTime;
                if (gap > 5000) {
                  console.log(
                    `⏱️ [SSE] Gap of ${(gap / 1000).toFixed(1)}s before event #${eventCount} (type="${data.type}")`
                  );
                }
                lastEventType = data.type;
                lastEventTime = now;
                console.log(`📥 [SSE] #${eventCount} type="${data.type}"`, data);
                handleStreamEvent(data);
              } catch (e) {
                // Ignore parse errors for incomplete JSON
                console.log("⚠️ [SSE] Failed to parse:", line.slice(0, 200));
              }
            } else if (line.trim() && !line.startsWith(":")) {
              // Log unexpected non-data, non-comment lines
              console.log(`❓ [SSE] Non-data line: "${line.slice(0, 200)}"`);
            }
          }
        }

        // Stream ended — check if we got a proper completion
        console.log(
          `🏁 [SSE] Post-stream state check: workflowStatus will be read from React state on next render`
        );
        // Note: Don't set workflowStatus to complete here
        // The status is managed by handleStreamEvent based on actual events
        // This allows the workflow to stay in "executing" state while waiting for approval
      } catch (err) {
        console.error("Workflow error:", err);
        setError(err instanceof Error ? err.message : "Workflow failed");
        setWorkflowStatus("error");
      }
    },
    [workflowStatus, steps, originalRequest, planThinking, statusMessages, loadedIntegrations]
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
        search_results?: WorkflowStep["search_results"];
        email_results?: WorkflowStep["email_results"];
        ui_component?: string | null;
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
      tool_calls?: Array<{
        id: string;
        tool_name: string;
        integration: string;
        ui_component?: string | null;
        arguments: Record<string, unknown>;
      }>;
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
    console.log(`🔄 [SSE] event.type="${event.type}"`, {
      thread_id: event.thread_id,
      current_step: event.current_step,
      total_steps: event.total_steps,
      is_complete: event.plan?.is_complete,
      steps_count: event.plan?.steps?.length,
      step_statuses: event.plan?.steps?.map((s) => `${s.step_number}:${s.status}`),
      has_message: !!event.message,
      has_interrupt: !!event.interrupt,
    });

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
                    result: "", // Clear thinking tokens — real result tokens follow
                  }
                : step
            )
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
                : step
            )
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
        console.log(
          `📊 [PROGRESS] thread=${event.thread_id}, current_step=${event.current_step}, is_complete=${event.plan?.is_complete}`,
          {
            incoming_steps: event.plan?.steps?.map(
              (s) => `${s.step_number}:${s.status}${s.result ? "(has result)" : ""}`
            ),
          }
        );

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
            // Merge step data, preserving pending_approval status and tool_calls
            const merged = event.plan!.steps.map((s) => {
              const existingStep = prev.find((p) => p.step_number === s.step_number);
              // If we locally marked a step as awaiting_approval, keep that
              const preserveApproval = existingStep?.status === "awaiting_approval";
              const finalStatus = (
                preserveApproval ? "awaiting_approval" : s.status
              ) as WorkflowStep["status"];

              if (preserveApproval) {
                console.log(
                  `⚠️ [PROGRESS] Step ${s.step_number}: backend says "${s.status}" but preserving local "awaiting_approval"`
                );
              }

              return {
                step_number: s.step_number,
                description: s.description,
                status: finalStatus,
                tools_used: s.tools_used,
                result: s.result ?? existingStep?.result,
                requires_human_approval: s.requires_human_approval,
                approval_reason: s.approval_reason,
                // Per-step thinking
                thinking: s.thinking || existingStep?.thinking,
                thinking_duration_ms: s.thinking_duration_ms || existingStep?.thinking_duration_ms,
                // Preserve tool_calls so collapsed cards persist
                tool_calls: existingStep?.tool_calls,
                // Structured search results from backend
                search_results: s.search_results || existingStep?.search_results,
                // Structured email results from backend
                email_results: s.email_results || existingStep?.email_results,
                // Backend-resolved UI component ID
                ui_component: s.ui_component || existingStep?.ui_component,
              };
            });

            console.log(
              `📊 [PROGRESS] Steps after merge:`,
              merged.map((s) => `${s.step_number}:${s.status}`)
            );
            return merged;
          });
          setWorkflowStatus("executing");
        }

        if (event.current_step !== undefined) {
          setCurrentStep(event.current_step);
        }

        if (event.plan?.is_complete) {
          console.log(`✅ [PROGRESS] is_complete=true, setting workflowStatus to "complete"`);
          setWorkflowStatus("complete");
        }
        break;

      case "error":
        setError(event.message || "Unknown error");
        setWorkflowStatus("error");
        // Mark current step as failed
        setSteps((prev) =>
          prev.map((step, idx) =>
            idx === currentStep ? { ...step, status: "failed", error: event.message } : step
          )
        );
        break;

      case "done":
        console.log(
          `✅ [DONE] Received "done" event. Setting workflowStatus to "complete". Current steps:`,
          steps.map((s) => `${s.step_number}:${s.status}`)
        );
        setWorkflowStatus("complete");
        break;

      case "auth_required":
        // Workflow stopped — user needs to connect integrations
        if (event.integrations) {
          setAuthRequired(
            event.integrations as unknown as Array<{
              mcp_server: string;
              display_name: string;
              icon: string;
              connect_id: string;
            }>
          );
        }
        setWorkflowStatus("error");
        break;

      case "approval_required":
        // Workflow is paused waiting for approval
        console.log("🔐 [APPROVAL] Received approval_required event:", event);
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
            "📝 [APPROVAL] Updating step",
            event.interrupt.step_number,
            "to awaiting_approval"
          );
          setSteps((prev) =>
            prev.map((step) =>
              step.step_number === event.interrupt!.step_number
                ? {
                    ...step,
                    status: "awaiting_approval" as const,
                    approval_reason: event.interrupt!.reason,
                    preview: event.interrupt!.preview,
                    tool_calls: event.interrupt!.tool_calls || [],
                  }
                : step
            )
          );
          setCurrentStep(event.interrupt.step_number - 1);
        }
        // Stop workflow execution - don't mark as complete
        setWorkflowStatus("executing");
        break;

      default:
        console.warn(`⚠️ [SSE] Unhandled event type: "${event.type}"`, event);
        break;
    }
  };

  const handleRetry = useCallback(
    async (stepNumber: number) => {
      // Reset the failed step and subsequent steps
      setSteps((prev) =>
        prev.map((step) =>
          step.step_number >= stepNumber ? { ...step, status: "pending", error: undefined } : step
        )
      );
      setCurrentStep(stepNumber - 1);
      setWorkflowStatus("executing");
      setError(null);

      try {
        const data = await retryMutation.mutateAsync({
          thread_id: threadIdRef.current!,
          step_number: stepNumber,
        });

        if (data.plan?.steps) {
          setSteps((prev) => {
            const prevByNumber = new Map(prev.map((s) => [s.step_number, s]));
            return data.plan.steps.map(
              (s: {
                step_number: number;
                description: string;
                status: string;
                result?: string;
                search_results?: WorkflowStep["search_results"];
                email_results?: WorkflowStep["email_results"];
                ui_component?: string | null;
              }) => {
                const existing = prevByNumber.get(s.step_number);
                return {
                  step_number: s.step_number,
                  description: s.description,
                  status: s.status as WorkflowStep["status"],
                  result: s.result,
                  tool_calls: existing?.tool_calls,
                  search_results: s.search_results || existing?.search_results,
                  email_results: s.email_results || existing?.email_results,
                  ui_component: s.ui_component || existing?.ui_component,
                };
              }
            );
          });
        }

        if (data.is_complete) {
          setWorkflowStatus("complete");
        }
      } catch (err) {
        console.error("Retry error:", err);
        setError(err instanceof Error ? err.message : "Retry failed");
        setWorkflowStatus("error");
      }
    },
    [retryMutation]
  );

  const handleApprove = useCallback(
    async (
      stepNumber: number,
      action: "approve" | "edit" | "skip",
      content?: Record<string, unknown>
    ) => {
      try {
        // First update UI optimistically — keep tool_calls for collapsed card view
        // When action is "edit", also update tool_call arguments so the preview
        // shows the edited content (even if the component remounts).
        const editedToolCalls =
          action === "edit" && content?.tool_calls
            ? (content.tool_calls as Array<{ id: string; arguments: Record<string, unknown> }>)
            : null;

        setSteps((prev) =>
          prev.map((step) => {
            if (step.step_number !== stepNumber) return step;
            let updatedToolCalls = step.tool_calls;
            if (editedToolCalls && step.tool_calls) {
              updatedToolCalls = step.tool_calls.map((tc) => {
                const edited = editedToolCalls.find((e) => e.id === tc.id);
                return edited ? { ...tc, arguments: { ...tc.arguments, ...edited.arguments } } : tc;
              });
            }
            return {
              ...step,
              tool_calls: updatedToolCalls,
              status: action === "skip" ? ("skipped" as const) : ("in_progress" as const),
            };
          })
        );

        const data = await resumeMutation.mutateAsync({
          thread_id: threadIdRef.current!,
          action,
          content: action === "edit" ? content : undefined,
        });

        // Extract tool_calls for a new approval step from the resume response
        const newApproval = data.approval_step_info as
          | {
              step_number: number;
              tool_calls?: Array<{
                id: string;
                tool_name: string;
                integration: string;
                ui_component?: string | null;
                arguments: Record<string, unknown>;
              }>;
              reason?: string;
            }
          | undefined;

        // Update steps from response — merge with existing to preserve tool_calls
        if (data.plan?.steps) {
          setSteps((prev) => {
            const prevByNumber = new Map(prev.map((s) => [s.step_number, s]));
            return data.plan.steps.map(
              (s: {
                step_number: number;
                description: string;
                status: string;
                result?: string;
                tools_used?: string[];
                requires_human_approval?: boolean;
                approval_reason?: string;
                thinking?: string;
                thinking_duration_ms?: number;
                search_results?: WorkflowStep["search_results"];
                email_results?: WorkflowStep["email_results"];
                ui_component?: string | null;
              }) => {
                const existing = prevByNumber.get(s.step_number);
                // If this step is the new approval step, apply tool_calls from approval_step_info
                const isNewApprovalStep = newApproval && s.step_number === newApproval.step_number;
                return {
                  step_number: s.step_number,
                  description: s.description,
                  status: s.status as WorkflowStep["status"],
                  result: s.result,
                  tools_used: s.tools_used,
                  requires_human_approval: s.requires_human_approval,
                  approval_reason: s.approval_reason,
                  // Per-step thinking
                  thinking: s.thinking || existing?.thinking,
                  thinking_duration_ms: s.thinking_duration_ms || existing?.thinking_duration_ms,
                  // New approval step gets tool_calls from approval_step_info;
                  // existing steps preserve their tool_calls
                  tool_calls: isNewApprovalStep
                    ? newApproval.tool_calls || []
                    : existing?.tool_calls,
                  // Structured search results
                  search_results: s.search_results || existing?.search_results,
                  // Structured email results
                  email_results: s.email_results || existing?.email_results,
                  // Backend-resolved UI component ID
                  ui_component: s.ui_component || existing?.ui_component,
                };
              }
            );
          });
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
              : step
          )
        );
      }
    },
    [resumeMutation]
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
    setAuthRequired(null);
    setPlanThinking(null);
    setStatusMessages([]);
    setLoadedIntegrations([]);
    threadIdRef.current = null;
  }, []);

  // === DEBUG: Log state changes ===
  useEffect(() => {
    console.log(
      `🎯 [STATE] workflowStatus="${workflowStatus}", steps=[${steps.map((s) => `${s.step_number}:${s.status}`).join(", ")}], currentStep=${currentStep}`
    );
  }, [workflowStatus, steps, currentStep]);

  useEffect(() => {
    if (error) {
      console.log(`❌ [STATE] error="${error}"`);
    }
  }, [error]);
  // === END DEBUG ===

  const isIdle = workflowStatus === "idle";
  const isChatActive = !isIdle;

  return (
    <div className="m-2 flex h-[calc(100vh-1rem)] w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#131313]">
      <div className="relative z-10 flex h-full w-full flex-col">
        {/* Idle state - show greeting and input */}
        {isIdle && (
          <div className="flex flex-1 flex-col justify-center px-4">
            <div className="mx-auto w-full max-w-2xl">
              <ChatGreeting userName={user?.name?.split(" ")[0] || "there"} subtitle="" />
              <ChatInputWithMentions
                onSubmit={executeWorkflow}
                placeholder="Type and press enter to start chatting..."
              />
            </div>
          </div>
        )}

        {/* Chat/Workflow in progress or complete */}
        {isChatActive && (
          <>
            {/* Scrollable content area - takes remaining space */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="scrollbar-thin scrollbar-thumb-[#2a2a2a] scrollbar-track-transparent scrollbar-thumb-rounded-full relative flex-1 overflow-x-hidden overflow-y-auto">
              <div className="px-4 pt-6 pb-4">
                <div className="mx-auto max-w-5xl space-y-6">
                  {/* Completed previous turns */}
                  {completedTurns.map((turn) => (
                    <div key={turn.id} className="space-y-4">
                      {/* Previous turn: user message bubble */}
                      <div className="flex justify-end">
                        <div className="max-w-xl rounded-[24px] border border-white/[0.06] bg-[#1a1a1a] px-5 py-0 text-[13px] font-medium shadow-sm">
                          <MarkdownRenderer content={turn.userMessage} />
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

                  {/* Current turn wrapper — min-height ensures scrollIntoView can position it at top */}
                  <div
                    ref={currentTurnRef}
                    className="space-y-6"
                    style={
                      completedTurns.length > 0 ? { minHeight: "calc(100vh - 150px)" } : undefined
                    }>
                    {/* Current turn: user message bubble */}
                    <div className="flex justify-end">
                      <div className="max-w-xl rounded-[24px] border border-white/[0.06] bg-[#1a1a1a] px-5 py-0 text-[13px] font-medium shadow-sm">
                        <MarkdownRenderer content={originalRequest} />
                      </div>
                    </div>

                    {/* Shimmer loading indicator while planning */}
                    {workflowStatus === "planning" && steps.length === 0 && (
                      <div className="flex items-center gap-2">
                        <Image
                          src="/logo.png"
                          alt="Logo"
                          width={32}
                          height={32}
                          className="rounded-full"
                        />
                        <ShimmerText
                          text="Working on it..."
                          className="!text-base !font-medium"
                          wrapperClassName="p-0 justify-start"
                        />
                      </div>
                    )}

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

                    {/* Auth required card */}
                    {authRequired && authRequired.length > 0 && (
                      <div className="flex items-start gap-4">
                        <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-zinc-400" />
                        <div className="max-w-md space-y-3">
                          <ShimmerText
                            text={`To continue with your request, please connect ${authRequired
                              .map((i) => i.display_name)
                              .join(" and ")}.`}
                            className="!text-sm !font-medium"
                            wrapperClassName="p-0 justify-start"
                          />
                          <div className="space-y-2">
                            {authRequired.map((integration) => {
                              const config = integrationConfig.find(
                                (c) => c.id === integration.connect_id
                              );
                              return (
                                <div
                                  key={integration.connect_id}
                                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-[#1a1a1a] px-4 py-3">
                                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white">
                                    {config?.icon ? (
                                      <Image
                                        src={config.icon}
                                        alt={integration.display_name}
                                        width={20}
                                        height={20}
                                        className="object-contain"
                                      />
                                    ) : (
                                      <span className="text-xs text-zinc-400">
                                        {integration.display_name.charAt(0)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-zinc-200">
                                      {integration.display_name}
                                    </p>
                                    {config?.description && (
                                      <p className="truncate text-xs text-zinc-500">
                                        {config.description}
                                      </p>
                                    )}
                                  </div>
                                  <a
                                    href={`${process.env.NEXT_PUBLIC_API_URL}/oauth/${integration.connect_id}?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`}
                                    className="bubble flex-shrink-0 rounded-3xl bg-white/[0.08] px-3.5 py-2.5 text-xs font-light text-zinc-200 transition-colors hover:bg-white/[0.12]">
                                    Connect
                                  </a>
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-xs text-zinc-600">
                            After connecting, try your request again.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Error display */}
                    {error && !authRequired && (
                      <div className="flex items-start gap-4">
                        <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
                        <div className="rounded-2xl border border-red-500/30 bg-[#1a1a1a] px-4 py-3">
                          <p className="text-sm text-red-400">
                            <strong>Error:</strong> {error}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Fixed chat input at the bottom */}
            <div className="flex-shrink-0 bg-[#131313] px-4 pt-2 pb-4">
              <div className="mx-auto max-w-5xl [&>div]:pb-0">
                <ChatInputWithMentions
                  onSubmit={executeWorkflow}
                  disabled={workflowStatus !== "complete"}
                  placeholder={
                    workflowStatus === "complete"
                      ? "Send a follow-up message..."
                      : "Send a message..."
                  }
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
