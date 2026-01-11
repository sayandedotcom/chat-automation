"use client";

import { useState, useCallback, useRef } from "react";
import { PlanetaryBackground } from "@/components/planetary-background";
import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { StarsBackground } from "@workspace/ui/components/stars-background";
import { ChatGreeting } from "@/components/chat-greeting";
import { ChatInputWithMentions } from "@/components/chat-input";
import { WorkflowTimeline, WorkflowStep } from "@/components/workflow-timeline";

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

type WorkflowStatus = "idle" | "planning" | "executing" | "complete" | "error";

export default function WorkflowPage() {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("idle");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [originalRequest, setOriginalRequest] = useState("");
  const [error, setError] = useState<string | null>(null);
  const threadIdRef = useRef<string | null>(null);

  const executeWorkflow = useCallback(async (request: string) => {
    setOriginalRequest(request);
    setWorkflowStatus("planning");
    setSteps([]);
    setCurrentStep(0);
    setError(null);

    try {
      // Use streaming endpoint for real-time updates
      const response = await fetch("/api/workflow/stream", {
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
  }, []);

  const handleStreamEvent = (event: {
    type: string;
    thread_id?: string;
    current_step?: number;
    total_steps?: number;
    plan?: {
      steps: Array<{
        step_number: number;
        description: string;
        status: string;
        tools_used?: string[];
        result?: string;
        requires_human_approval?: boolean;
        approval_reason?: string;
      }>;
      is_complete?: boolean;
    };
    content?: string;
    message?: string;
    interrupt?: {
      type: string;
      step_number: number;
      description: string;
      reason?: string;
      preview?: Record<string, unknown>;
      actions?: string[];
    };
  }) => {
    switch (event.type) {
      case "progress":
        if (event.thread_id) {
          threadIdRef.current = event.thread_id;
        }

        if (event.plan?.steps) {
          setSteps((prev) => {
            // Merge step data, preserving pending_approval status that was set locally
            return event.plan!.steps.map((s) => {
              const existingStep = prev.find(
                (p) => p.step_number === s.step_number
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

      case "token":
        // Handle streaming tokens (for live output display)
        break;

      case "error":
        setError(event.message || "Unknown error");
        setWorkflowStatus("error");
        // Mark current step as failed
        setSteps((prev) =>
          prev.map((step, idx) =>
            idx === currentStep
              ? { ...step, status: "failed", error: event.message }
              : step
          )
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
        }
        // Update the step status to pending_approval
        if (event.interrupt?.step_number) {
          console.log(
            "📝 Updating step",
            event.interrupt.step_number,
            "to pending_approval"
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
                : step
            )
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
          : step
      )
    );
    setCurrentStep(stepNumber - 1);
    setWorkflowStatus("executing");
    setError(null);

    // Call the retry endpoint
    try {
      const response = await fetch("/api/workflow/retry", {
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
            })
          )
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
      content?: Record<string, unknown>
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
              : step
          )
        );

        // Call the resume endpoint
        const response = await fetch("/api/workflow/resume", {
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
              })
            )
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
              : step
          )
        );
      }
    },
    []
  );

  const handleNewWorkflow = useCallback(() => {
    setWorkflowStatus("idle");
    setSteps([]);
    setCurrentStep(0);
    setOriginalRequest("");
    setError(null);
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
              userName="Sayan"
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
            <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4">
              <div className="max-w-3xl mx-auto space-y-4">
                {/* User message - displayed on the right like a chat bubble */}
                <div className="flex justify-end">
                  <div className="bg-[#1f1f1f] rounded-2xl px-4 py-3 max-w-md">
                    <p className="text-white/90 text-sm">{originalRequest}</p>
                  </div>
                </div>

                {/* Timeline/Workflow steps */}
                <WorkflowTimeline
                  steps={steps}
                  currentStep={currentStep}
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
                placeholder="Send a message..."
              />
            </div>
          </>
        )}
      </div>
    </ContentWrapper>
  );
}
