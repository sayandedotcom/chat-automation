"use client";

import { useChatWorkflow } from "@/hooks/use-chat-workflow";
import { ChatGreeting } from "@/components/chat-greeting";
import { ChatInputWithMentions } from "@/components/chat-input";
import { WorkflowTimeline } from "@/components/workflow-timeline";

function ContentWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#0a0a0a]">
      {children}
    </div>
  );
}

export default function NewChatPage() {
  const workflow = useChatWorkflow({
    onConversationCreated: (id) => {
      // Update URL without triggering Next.js navigation/remount.
      // router.replace would unmount this page and mount [conversationId]/page.tsx,
      // killing the active SSE stream. window.history.replaceState keeps the
      // component alive while updating the browser URL.
      window.history.replaceState(null, "", `/chat/${id}`);
    },
  });

  const isIdle = workflow.workflowStatus === "idle";
  const isChatActive = !isIdle;

  return (
    <ContentWrapper>
      <div className="relative z-10 flex h-full w-full flex-col">
        {/* Idle state - show greeting and input */}
        {isIdle && (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <ChatGreeting
              userName="Sayan"
              subtitle="Describe your workflow and I'll execute it step by step"
            />
            <ChatInputWithMentions
              onSubmit={workflow.executeWorkflow}
              placeholder="e.g., Research the best auth services, create a Notion doc with findings..."
            />
          </div>
        )}

        {/* Chat/Workflow in progress or complete */}
        {isChatActive && (
          <>
            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6">
              <div className="mx-auto max-w-3xl space-y-4">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="max-w-md rounded-2xl bg-[#1f1f1f] px-4 py-3">
                    <p className="text-sm text-white/90">
                      {workflow.originalRequest}
                    </p>
                  </div>
                </div>

                {/* Timeline/Workflow steps */}
                <WorkflowTimeline
                  steps={workflow.steps}
                  currentStep={workflow.currentStep}
                  planThinking={workflow.planThinking || undefined}
                  statusMessages={workflow.statusMessages}
                  loadedIntegrations={workflow.loadedIntegrations}
                  onRetry={workflow.handleRetry}
                  onApprove={workflow.handleApprove}
                  isComplete={workflow.workflowStatus === "complete"}
                />

                {/* Error display */}
                {workflow.error && (
                  <div className="flex items-start gap-4">
                    <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-red-400" />
                    <div className="rounded-2xl border border-red-500/30 bg-[#1a1a1a] px-4 py-3">
                      <p className="text-sm text-red-400">
                        <strong>Error:</strong> {workflow.error}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fixed chat input at the bottom */}
            <div className="flex-shrink-0 border-t border-white/5 bg-[#0a0a0a] px-4 pb-6 pt-2">
              <div className="mx-auto max-w-3xl">
                <ChatInputWithMentions
                  onSubmit={workflow.executeWorkflow}
                  placeholder="Send a message..."
                  disabled={workflow.workflowStatus === "planning"}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </ContentWrapper>
  );
}
