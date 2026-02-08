import { useState, useCallback, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@workspace/trpc/client/react";
import type { WorkflowStep } from "@/components/workflow-timeline";

type WorkflowStatus = "idle" | "planning" | "executing" | "complete" | "error";

interface IntegrationInfo {
  name: string;
  display_name: string;
  tools_count: number;
  icon: string;
}

interface UseChatWorkflowOptions {
  /** Set when navigating to an existing conversation from sidebar */
  initialConversationId?: string;
  /** Called after a NEW conversation is created (for URL update) */
  onConversationCreated?: (id: string) => void;
}

export function useChatWorkflow(options?: UseChatWorkflowOptions) {
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
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const threadIdRef = useRef<string | null>(null);
  const conversationCreatedRef = useRef(false);

  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Create conversation mutation
  const createConversation = useMutation(
    trpc.conversation.create.mutationOptions({
      onSuccess: (conversation) => {
        options?.onConversationCreated?.(conversation.id);
        queryClient.invalidateQueries({
          queryKey: trpc.conversation.list.queryKey(),
        });
      },
    })
  );

  // Load existing conversation ONLY when opening from sidebar (initialConversationId)
  // This runs once on mount - never during an active workflow
  useEffect(() => {
    if (!options?.initialConversationId) return;

    let cancelled = false;

    async function loadExisting() {
      setIsLoadingHistory(true);
      try {
        // Step 1: Get conversation metadata from tRPC
        const conversation = await trpc.client.conversation.get.query({
          id: options!.initialConversationId!,
        });

        if (cancelled || !conversation?.threadId) return;

        threadIdRef.current = conversation.threadId;
        conversationCreatedRef.current = true; // Already exists, don't create again

        // Step 2: Load workflow state from agent
        const response = await fetch(
          `/api/chat/history/${conversation.threadId}`
        );
        if (!response.ok || cancelled) return;

        const data = await response.json();
        if (cancelled) return;

        if (data.plan) {
          setSteps(
            data.plan.steps.map((s: any) => ({
              step_number: s.step_number,
              description: s.description,
              status: s.status,
              result: s.result,
              error: s.error,
              tools_used: s.tools_used || [],
              requires_human_approval: s.requires_human_approval,
              approval_reason: s.approval_reason,
              thinking: s.thinking,
              thinking_duration_ms: s.thinking_duration_ms,
              search_results: s.search_results,
            }))
          );
          setOriginalRequest(data.plan.original_request || "");
          setPlanThinking(data.plan.thinking);
          setWorkflowStatus(data.plan.is_complete ? "complete" : "executing");
          setCurrentStep(data.current_step_index);
        }

        if (data.loaded_integrations) {
          setLoadedIntegrations(data.loaded_integrations);
        }
      } catch (err) {
        console.error("Error loading conversation history:", err);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    }

    loadExisting();
    return () => {
      cancelled = true;
    };
  }, [options?.initialConversationId]);

  const handleStreamEvent = useCallback(
    (event: any) => {
      switch (event.type) {
        case "integrations_ready":
          setStatusMessages((prev) => [
            ...prev,
            {
              text: `Loaded ${event.total_tools} tools from ${event.total_integrations} integrations`,
              icon: "🔌",
            },
          ]);
          break;

        case "integration_added_incrementally":
          if (event.integration) {
            setLoadedIntegrations((prev) => [...prev, event.integration]);
            setStatusMessages((prev) => [
              ...prev,
              {
                text: `Added ${event.integration.display_name} (${event.integration.tools_count} tools)`,
                icon: event.integration.icon || "🔌",
              },
            ]);
          }
          break;

        case "step_thinking":
          if (event.step_number) {
            setSteps((prev) =>
              prev.map((s) =>
                s.step_number === event.step_number
                  ? {
                      ...s,
                      thinking: event.content,
                      thinking_duration_ms: event.duration_hint,
                    }
                  : s
              )
            );
          }
          break;

        case "token":
          break;

        case "thinking":
          setPlanThinking(event.content || null);
          break;

        case "progress":
          // Create conversation ONCE on the first progress event
          if (event.thread_id && !conversationCreatedRef.current) {
            threadIdRef.current = event.thread_id;
            conversationCreatedRef.current = true;
            createConversation.mutate({
              threadId: event.thread_id,
              title: originalRequest.slice(0, 100) || "New Chat",
            });
          }

          if (event.plan) {
            const planSteps: WorkflowStep[] = event.plan.steps.map(
              (s: any) => ({
                step_number: s.step_number,
                description: s.description,
                status: s.status,
                result: s.result,
                error: s.error,
                tools_used: s.tools_used || [],
                requires_human_approval: s.requires_human_approval,
                approval_reason: s.approval_reason,
                thinking: s.thinking,
                thinking_duration_ms: s.thinking_duration_ms,
                search_results: s.search_results,
              })
            );

            setSteps(planSteps);
            setPlanThinking(event.plan.thinking || null);
            setCurrentStep(event.current_step ?? 0);

            if (planSteps.some((s) => s.status === "in_progress")) {
              setWorkflowStatus("executing");
            }
          }
          break;

        case "approval_required":
          setWorkflowStatus("executing");
          if (event.step_number || event.interrupt?.step_number) {
            const stepNum =
              event.step_number || event.interrupt?.step_number;
            setSteps((prev) =>
              prev.map((s) =>
                s.step_number === stepNum
                  ? { ...s, status: "awaiting_approval" as const }
                  : s
              )
            );
          }
          break;

        case "error":
          setError(event.error || "Unknown error");
          setWorkflowStatus("error");
          break;

        case "done":
          setWorkflowStatus("complete");
          setStatusMessages((prev) => [
            ...prev,
            { text: "Workflow complete!", icon: "✅" },
          ]);
          break;
      }
    },
    [originalRequest, createConversation]
  );

  const executeWorkflow = useCallback(
    async (request: string) => {
      setOriginalRequest(request);
      setWorkflowStatus("planning");
      setSteps([]);
      setCurrentStep(0);
      setError(null);
      setPlanThinking(null);
      setStatusMessages([]);
      setLoadedIntegrations([]);

      try {
        const response = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            request,
            thread_id: threadIdRef.current,
          }),
        });

        if (!response.ok) throw new Error("Failed to start workflow");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

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
                handleStreamEvent(data);
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (err) {
        console.error("Workflow error:", err);
        setError(err instanceof Error ? err.message : "Workflow failed");
        setWorkflowStatus("error");
      }
    },
    [handleStreamEvent]
  );

  const handleRetry = useCallback(async (stepNumber: number) => {
    try {
      const response = await fetch("/api/chat/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadIdRef.current,
          step_number: stepNumber,
        }),
      });
      if (!response.ok) throw new Error("Failed to retry step");

      const data = await response.json();
      if (data.plan) {
        setSteps(
          data.plan.steps.map((s: any) => ({
            step_number: s.step_number,
            description: s.description,
            status: s.status,
            result: s.result,
            error: s.error,
            tools_used: s.tools_used || [],
            requires_human_approval: s.requires_human_approval,
            approval_reason: s.approval_reason,
            thinking: s.thinking,
            thinking_duration_ms: s.thinking_duration_ms,
            search_results: s.search_results,
          }))
        );
      }
    } catch (err) {
      console.error("Retry error:", err);
      setError(err instanceof Error ? err.message : "Failed to retry step");
    }
  }, []);

  const handleApprove = useCallback(
    async (
      stepNumber: number,
      action: "approve" | "edit" | "skip",
      content?: Record<string, unknown>
    ) => {
      try {
        const response = await fetch("/api/chat/resume", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: threadIdRef.current,
            action,
            content,
          }),
        });
        if (!response.ok) throw new Error("Failed to resume workflow");

        const data = await response.json();
        if (data.plan) {
          setSteps(
            data.plan.steps.map((s: any) => ({
              step_number: s.step_number,
              description: s.description,
              status: s.status,
              result: s.result,
              error: s.error,
              tools_used: s.tools_used || [],
              requires_human_approval: s.requires_human_approval,
              approval_reason: s.approval_reason,
              thinking: s.thinking,
              thinking_duration_ms: s.thinking_duration_ms,
              search_results: s.search_results,
            }))
          );
          setWorkflowStatus("executing");
        }
      } catch (err) {
        console.error("Approve error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to approve step"
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
    setPlanThinking(null);
    setStatusMessages([]);
    setLoadedIntegrations([]);
    threadIdRef.current = null;
    conversationCreatedRef.current = false;
  }, []);

  return {
    workflowStatus,
    steps,
    currentStep,
    originalRequest,
    error,
    planThinking,
    statusMessages,
    loadedIntegrations,
    threadIdRef,
    executeWorkflow,
    handleRetry,
    handleApprove,
    handleNewWorkflow,
    isLoadingHistory,
  };
}
