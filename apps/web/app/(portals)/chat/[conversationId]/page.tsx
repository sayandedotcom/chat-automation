"use client";

import { use } from "react";
import { useChatWorkflow } from "@/hooks/use-chat-workflow";
import { ChatInputWithMentions } from "@/components/chat-input";
import { WorkflowTimeline } from "@/components/workflow-timeline";
import { Loader2 } from "lucide-react";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = use(params);
  const workflow = useChatWorkflow({ initialConversationId: conversationId });

  if (workflow.isLoadingHistory) {
    return (
      <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#0a0a0a]">
        <div className="relative z-10 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-white/50" />
          <p className="text-sm text-white/50">Loading conversation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#0a0a0a]">
      <div className="relative z-10 flex h-full flex-col">
        {/* Chat content with scroll */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="mx-auto max-w-3xl space-y-6">
            {/* User's original message */}
            {workflow.originalRequest && (
              <div className="flex justify-end">
                <div className="rounded-2xl bg-[#1f1f1f] px-4 py-3 max-w-md">
                  <p className="text-sm text-white/90">
                    {workflow.originalRequest}
                  </p>
                </div>
              </div>
            )}

            {/* Workflow timeline */}
            {workflow.steps.length > 0 && (
              <WorkflowTimeline
                steps={workflow.steps}
                currentStep={workflow.currentStep}
                planThinking={workflow.planThinking || undefined}
                loadedIntegrations={workflow.loadedIntegrations}
                onRetry={workflow.handleRetry}
                onApprove={workflow.handleApprove}
                isComplete={workflow.workflowStatus === "complete"}
              />
            )}

            {/* Error display */}
            {workflow.error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-sm text-red-400">{workflow.error}</p>
              </div>
            )}
          </div>
        </div>

        {/* Fixed chat input at bottom */}
        <div className="border-t border-white/5 bg-[#0a0a0a]/80 p-4 backdrop-blur-sm">
          <div className="mx-auto max-w-3xl">
            <ChatInputWithMentions
              onSubmit={workflow.executeWorkflow}
              disabled={workflow.workflowStatus === "planning"}
              placeholder={
                workflow.workflowStatus === "complete"
                  ? "Continue the conversation..."
                  : "Type your message..."
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
