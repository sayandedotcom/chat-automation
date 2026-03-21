"use client";

import { useMemo, useRef } from "react";

import Image from "next/image";

import { Check, Loader2, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import ShimmerText from "@workspace/ui/components/kokonutui/shimmer-text";
import { MarkdownRenderer } from "@workspace/ui/components/tiptap-markdown-renderer";
import { cn } from "@workspace/ui/lib/utils";

import {
  toolIconMap as configToolIconMap,
  toolNameMap as configToolNameMap,
} from "@/config/integrations";

import { CalendarEventEditor } from "./calendar-event-editor";
import { DocumentEditor } from "./document-editor";
import { EmailComposer } from "./email-composer";
import { EmailListCard } from "./email-list-card";
import type { EmailResultData } from "./email-list-card";
import { NotionPageEditor } from "./notion-page-editor";
import { SearchResultsList, parseSearchResults } from "./search-results-list";
import { SheetsEditor } from "./sheets-editor";
import { ThinkingIndicator } from "./thinking-indicator";
import { WebSearchCard } from "./web-search-card";

// Context passed to each renderer in UI_COMPONENT_RENDERERS
interface EditorRenderContext {
  primaryToolCall: ToolCallPreview;
  step: WorkflowStep;
  isCompleted: boolean;
  onApprove: NonNullable<WorkflowTimelineProps["onApprove"]>;
}

// Backend-driven renderer map: ui_component string → render function
const UI_COMPONENT_RENDERERS: Record<string, (ctx: EditorRenderContext) => React.ReactNode> = {
  email_composer: (ctx) => (
    <EmailComposer
      toolCall={ctx.primaryToolCall}
      stepNumber={ctx.step.step_number}
      onApprove={ctx.onApprove}
      completed={ctx.isCompleted}
    />
  ),
  document_editor: (ctx) => (
    <DocumentEditor
      toolCall={ctx.primaryToolCall}
      stepNumber={ctx.step.step_number}
      onApprove={ctx.onApprove}
      completed={ctx.isCompleted}
    />
  ),
  notion_page_editor: (ctx) => (
    <NotionPageEditor
      toolCall={ctx.primaryToolCall}
      stepNumber={ctx.step.step_number}
      onApprove={ctx.onApprove}
      completed={ctx.isCompleted}
    />
  ),
  calendar_event_editor: (ctx) => (
    <CalendarEventEditor
      toolCall={ctx.primaryToolCall}
      stepNumber={ctx.step.step_number}
      onApprove={ctx.onApprove}
      completed={ctx.isCompleted}
      userHint={ctx.step.description}
    />
  ),
  sheets_editor: (ctx) => (
    <SheetsEditor
      toolCalls={ctx.step.tool_calls!}
      stepNumber={ctx.step.step_number}
      onApprove={ctx.onApprove}
      completed={ctx.isCompleted}
    />
  ),
  web_search_card: (ctx) => (
    <WebSearchCard
      toolCall={ctx.primaryToolCall}
      stepNumber={ctx.step.step_number}
      onApprove={ctx.onApprove}
      completed={ctx.isCompleted}
      searchResults={ctx.step.search_results}
    />
  ),
  email_list_card: (ctx) => (
    <EmailListCard
      emails={ctx.step.email_results || []}
      stepNumber={ctx.step.step_number}
      description={ctx.step.description}
    />
  ),
};

// Thinking event from the backend
export interface ThinkingEvent {
  content: string;
  duration: number;
  timestamp?: number;
}

// Search result item (matches backend SearchResultItem)
export interface SearchResultData {
  title: string;
  url: string;
  domain: string;
  favicon?: string;
  date?: string;
}

// Structured tool call data for rich approval UI
export interface ToolCallPreview {
  id: string;
  tool_name: string;
  integration: string;
  ui_component?: string | null;
  arguments: Record<string, unknown>;
}

export interface WorkflowStep {
  step_number: number;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped" | "awaiting_approval";
  result?: string;
  error?: string;
  tools_used?: string[];
  requires_human_approval?: boolean;
  approval_reason?: string;
  preview?: Record<string, unknown>; // Preview content for approval
  tool_calls?: ToolCallPreview[]; // Tool call data for rich approval UI
  // Structured search results from Tavily
  search_results?: SearchResultData[];
  // Structured email results from Gmail
  email_results?: EmailResultData[];
  // Backend-resolved UI component ID for result rendering
  ui_component?: string | null;
  // Per-step thinking
  thinking?: string;
  thinking_duration_ms?: number;
}

// Integration info from smart router
export interface IntegrationInfo {
  name: string;
  display_name: string;
  tools_count: number;
  icon: string;
}

interface WorkflowTimelineProps {
  steps: WorkflowStep[];
  currentStep: number;
  thinkingEvents?: ThinkingEvent[];
  statusMessages?: Array<{
    text: string;
    icon?: string;
    timestamp?: number;
    type?: string;
  }>;
  planThinking?: string; // Initial thinking from the planner
  loadedIntegrations?: IntegrationInfo[]; // Integrations loaded by smart router
  onRetry?: (stepNumber: number) => void;
  onApprove?: (
    stepNumber: number,
    action: "approve" | "edit" | "skip",
    content?: Record<string, unknown>
  ) => void;
  isComplete?: boolean;
  className?: string;
}

// Derived from config — override web-search icon for dark timeline UI
const toolIconMap: Record<string, string> = {
  ...configToolIconMap,
  "web-search": "/integrations/web_search.svg",
};

const toolNameMap: Record<string, string> = {
  ...configToolNameMap,
  general: "General",
};

// Editor components that require real tool_calls data (title, content, etc.)
// These must NOT render from synthetic/placeholder primaryToolCall in the rich-card path.
const EDITOR_COMPONENTS = new Set([
  "document_editor",
  "notion_page_editor",
  "sheets_editor",
  "email_composer",
  "calendar_event_editor",
]);

// Check if a step should show a rich result card (with expandable content).
// Only returns true when a specific renderer exists — no generic card fallbacks.
function shouldShowRichCard(step: WorkflowStep): boolean {
  // Backend-driven ui_component that has a renderer AND is NOT an editor
  // (editors are handled by the tool-card branch which requires real tool_calls)
  if (
    step.ui_component &&
    UI_COMPONENT_RENDERERS[step.ui_component] &&
    !EDITOR_COMPONENTS.has(step.ui_component)
  ) {
    return true;
  }

  // Structured search results → WebSearchCard
  if (step.search_results && step.search_results.length > 0) {
    return true;
  }

  // Structured email results → EmailListCard
  if (step.email_results && step.email_results.length > 0) {
    return true;
  }

  return false;
}

export function WorkflowTimeline({
  steps,
  currentStep,
  thinkingEvents,
  statusMessages,
  planThinking,
  loadedIntegrations,
  onRetry,
  onApprove,
  isComplete,
  className,
}: WorkflowTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

  // Filter steps to only show visible ones (not pending) - memoized to prevent infinite loops
  const visibleSteps = useMemo(() => {
    const visible = steps.filter((step) => step.status !== "pending");
    console.log(
      `👁️ [TIMELINE] All steps: [${steps.map((s) => `${s.step_number}:${s.status}`).join(", ")}]`
    );
    console.log(
      `👁️ [TIMELINE] Visible (non-pending): [${visible.map((s) => `${s.step_number}:${s.status}`).join(", ")}]`
    );
    return visible;
  }, [steps]);

  if (steps.length === 0) {
    return null;
  }

  // Calculate timeline line height based on visible steps
  const lineHeight = visibleSteps.length > 0 ? `calc(100% - 12px)` : "0px";

  return (
    <div className={cn("mx-auto w-full max-w-5xl py-4", className)}>
      {/* Timeline with vertical line */}
      <div className="relative" ref={timelineRef}>
        {/* Animated vertical timeline line */}
        <div
          className="absolute top-3 left-[9px] w-[2px] bg-white/10 transition-all duration-500 ease-out"
          style={{ height: lineHeight }}
        />

        {/* Timeline items: thinking blocks, status messages, and steps */}
        <div className="space-y-4">
          {/* Initial thinking from planner */}
          {planThinking && (
            <div className="flex items-start gap-4">
              <div className="relative z-10 flex-shrink-0">
                <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/20 bg-[#0a0a0a]">
                  <div className="h-1.5 w-1.5 rounded-full bg-white/60" />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <ThinkingIndicator content={planThinking} duration={2} defaultExpanded={true} />
              </div>
            </div>
          )}

          {/* Integration indicator (e.g., "Added 2 integrations successfully") */}
          {loadedIntegrations && loadedIntegrations.length > 0 && (
            <div className="flex items-start gap-4">
              <div className="relative z-10 flex-shrink-0">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10">
                  <Check className="h-3 w-3 text-white/80" />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-white/70">
                    Added {loadedIntegrations.length} integration
                    {loadedIntegrations.length !== 1 ? "s" : ""} successfully
                  </span>
                  <div className="flex gap-1.5">
                    {loadedIntegrations.map((integration) => (
                      <Image
                        key={integration.name}
                        src={`/integrations/${integration.icon}.svg`}
                        alt={integration.display_name}
                        width={16}
                        height={16}
                        className="opacity-70"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Status messages (e.g., "Added 2 integrations successfully") */}
          {statusMessages?.map((msg, idx) => (
            <div key={`status-${idx}`} className="flex items-start gap-4">
              <div className="relative z-10 flex-shrink-0">
                <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/20 bg-[#0a0a0a]">
                  <Plus className="h-3 w-3 text-white/50" />
                </div>
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm text-white/50">{msg.text}</p>
              </div>
            </div>
          ))}

          {/* Workflow steps */}
          {visibleSteps.map((step, index) => {
            const primaryTool = step.tools_used?.[0] || "general";
            const toolIcon = toolIconMap[primaryTool];
            const isRichCard = shouldShowRichCard(step);

            // Determine which rendering branch this step will take
            const hasToolCalls = !!(step.tool_calls && step.tool_calls.length > 0);
            const toolCallBranchActive =
              hasToolCalls &&
              ["awaiting_approval", "in_progress", "completed", "skipped"].includes(step.status);
            let renderBranch = "unknown";
            if (toolCallBranchActive) {
              const integration = step.tool_calls![0]?.integration;
              renderBranch = `tool-card(integration=${integration}, tool=${step.tool_calls![0]?.tool_name})`;
            } else if (step.status === "awaiting_approval") {
              renderBranch = "loading-approval";
            } else if (step.status === "failed") {
              renderBranch = "failed-card";
            } else if (isRichCard && step.status === "completed") {
              renderBranch = `rich-card(tool=${primaryTool})`;
            } else {
              renderBranch = `simple-line(tool=${primaryTool})`;
            }
            console.log(
              `🎨 [RENDER] Step ${step.step_number}: status="${step.status}", branch="${renderBranch}", hasToolCalls=${hasToolCalls}, tool_calls=[${(step.tool_calls || []).map((tc) => `${tc.integration}/${tc.tool_name}`).join(",")}], isRichCard=${isRichCard}, result_len=${step.result?.length || 0}`
            );

            return (
              <div key={step.step_number} className="relative">
                {/* Step row with circle and content */}
                <div className="flex items-start gap-4">
                  {/* Left side - circle indicator on the timeline */}
                  <div className="relative z-10 flex-shrink-0">
                    {step.status === "in_progress" ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/40 bg-[#0a0a0a]">
                        <Loader2 className="h-3 w-3 animate-spin text-white/60" />
                      </div>
                    ) : step.status === "awaiting_approval" ? (
                      (() => {
                        // Prefer the tool call with a ui_component (the primary action)
                        const primaryTc =
                          step.tool_calls?.find((tc) => tc.ui_component) || step.tool_calls?.[0];
                        const integration = primaryTc?.integration;
                        const iconPath = integration ? `/integrations/${integration}.svg` : null;
                        return (
                          <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/30 bg-[#0a0a0a]">
                            {iconPath ? (
                              <Image
                                src={iconPath}
                                alt={integration || ""}
                                width={12}
                                height={12}
                                className="object-contain grayscale"
                              />
                            ) : (
                              <Loader2 className="h-3 w-3 animate-spin text-white/60" />
                            )}
                          </div>
                        );
                      })()
                    ) : step.status === "failed" ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-red-500/50 bg-[#0a0a0a]">
                        <X className="h-3 w-3 text-red-400" />
                      </div>
                    ) : step.status === "completed" ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/20 bg-[#0a0a0a]">
                        {toolIcon ? (
                          <Image
                            src={toolIcon}
                            alt={primaryTool}
                            width={12}
                            height={12}
                            className="object-contain opacity-70 grayscale"
                          />
                        ) : (
                          <Check className="h-3 w-3 text-white/50" />
                        )}
                      </div>
                    ) : (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-white/20 bg-[#0a0a0a]">
                        <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
                      </div>
                    )}
                  </div>

                  {/* Right side - content */}
                  <div className="min-w-0 flex-1">
                    {/* TOOL-SPECIFIC CARD — for steps with tool_calls (active or completed) */}
                    {step.tool_calls &&
                    step.tool_calls.length > 0 &&
                    (step.status === "awaiting_approval" ||
                      step.status === "in_progress" ||
                      step.status === "completed" ||
                      step.status === "skipped") ? (
                      (() => {
                        const primaryToolCall = step.tool_calls![0];
                        const isCompleted = step.status !== "awaiting_approval";

                        // Find ui_component from primary tool call, or first that has one
                        const uiComponent =
                          primaryToolCall?.ui_component ||
                          step.tool_calls!.find((tc) => tc.ui_component)?.ui_component;

                        const renderer = uiComponent
                          ? UI_COMPONENT_RENDERERS[uiComponent]
                          : undefined;

                        console.log(
                          `🎨 [TOOL-CARD] Step ${step.step_number}: ui_component="${uiComponent}", tool="${primaryToolCall?.tool_name}", isCompleted=${isCompleted}, hasRenderer=${!!renderer}`
                        );

                        if (renderer && primaryToolCall && (onApprove || isCompleted)) {
                          const ctx: EditorRenderContext = {
                            primaryToolCall,
                            step,
                            isCompleted,
                            onApprove: onApprove || (() => {}),
                          };
                          return (
                            <div className="space-y-2">
                              {renderer(ctx)}
                              {isCompleted && step.result && (
                                <div className="mt-2 text-sm text-gray-300">
                                  <MarkdownRenderer content={step.result} />
                                </div>
                              )}
                            </div>
                          );
                        }

                        // No renderer found — simple status line fallback
                        console.warn(
                          `⚠️ [TOOL-CARD] Step ${step.step_number}: No renderer for ui_component="${uiComponent}", tool="${primaryToolCall?.tool_name}" — rendering fallback`
                        );
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3 py-0.5">
                              <span className="text-sm text-white/50">{step.description}</span>
                            </div>
                            {isCompleted && step.result && (
                              <div className="mt-2 text-sm text-gray-300">
                                <MarkdownRenderer content={step.result} />
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : step.status === "awaiting_approval" ? (
                      // Brief loading state — tool_calls SSE event arrives shortly with the proper card
                      <div className="flex items-center gap-3 py-0.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-white/40" />
                        <span className="text-sm text-white/50">{step.description}</span>
                      </div>
                    ) : step.status === "failed" ? (
                      /* FAILED STEP CARD */
                      <div className="overflow-hidden rounded-2xl border border-red-500/30 bg-[#1a1a1a]">
                        <div className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-red-300">{step.description}</p>
                            {onRetry && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRetry(step.step_number)}
                                className="h-7 border-red-500/50 bg-transparent px-2 text-xs text-red-400 hover:bg-red-500/20">
                                <RotateCcw className="mr-1 h-3 w-3" />
                                Retry
                              </Button>
                            )}
                          </div>
                          {step.error && (
                            <p className="mt-2 text-xs text-red-400/70">{step.error}</p>
                          )}
                        </div>
                      </div>
                    ) : isRichCard && step.status === "completed" ? (
                      /* RICH RESULT CARD — result text first (streamed), then card below */
                      <div className="space-y-2">
                        {/* AI result text — rendered first so streamed content stays in place */}
                        {step.result && (
                          <div className="text-sm text-gray-300">
                            <MarkdownRenderer content={step.result} />
                          </div>
                        )}
                        {(() => {
                          // Try backend-driven renderer first — but skip editor components
                          // that require real tool_calls data (they'd render empty with
                          // synthetic placeholder arguments).
                          const canUseRenderer =
                            step.ui_component && !EDITOR_COMPONENTS.has(step.ui_component);
                          const renderer = canUseRenderer
                            ? UI_COMPONENT_RENDERERS[step.ui_component!]
                            : undefined;
                          if (renderer) {
                            return renderer({
                              step,
                              primaryToolCall: {
                                id: `result_${step.step_number}`,
                                tool_name: step.tools_used?.[0] || "",
                                integration: "",
                                arguments: { query: step.description },
                              },
                              onApprove: onApprove || (() => {}),
                              isCompleted: true,
                            });
                          }

                          // Structured search results without ui_component
                          if (step.search_results && step.search_results.length > 0) {
                            return (
                              <WebSearchCard
                                toolCall={{
                                  id: `search_${step.step_number}`,
                                  tool_name: "tavily_search",
                                  integration: "web_search",
                                  arguments: { query: step.description },
                                }}
                                stepNumber={step.step_number}
                                onApprove={onApprove || (() => {})}
                                completed={true}
                                searchResults={step.search_results}
                              />
                            );
                          }

                          // Structured email results without ui_component
                          if (step.email_results && step.email_results.length > 0) {
                            return (
                              <EmailListCard
                                emails={step.email_results}
                                stepNumber={step.step_number}
                                description={step.description}
                              />
                            );
                          }

                          // Safety-net fallback — shouldShowRichCard should prevent reaching here
                          return (
                            <div className="space-y-2">
                              <div className="flex items-center gap-3 py-0.5">
                                <span className="text-sm text-white/50">{step.description}</span>
                              </div>
                            </div>
                          );
                        })()}
                        {/* Per-step thinking for rich cards */}
                        {step.thinking && (
                          <ThinkingIndicator
                            content={step.thinking}
                            duration={Math.round((step.thinking_duration_ms || 2000) / 1000)}
                            defaultExpanded={false}
                          />
                        )}
                      </div>
                    ) : (
                      /* SIMPLE STATUS LINE (General messages - like image 3) */
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 py-0.5">
                          <div
                            className={cn(
                              "text-sm",
                              step.status === "in_progress" && "text-white/60",
                              step.status === "completed" && "text-white/50",
                              step.status === "skipped" && "text-white/40"
                            )}>
                            {step.status === "in_progress" ? (
                              <ShimmerText
                                text={step.description}
                                className="!text-sm !font-normal"
                                wrapperClassName="p-0 justify-start"
                              />
                            ) : (
                              <span>{step.description}</span>
                            )}
                            {(step.status === "completed" || step.status === "in_progress") &&
                              step.result &&
                              !isRichCard && (
                                <div className="mt-2 text-gray-400">
                                  <MarkdownRenderer content={step.result} />
                                </div>
                              )}
                          </div>
                        </div>
                        {/* Per-step thinking */}
                        {step.thinking && (
                          <div className="ml-7">
                            <ThinkingIndicator
                              content={step.thinking}
                              duration={Math.round((step.thinking_duration_ms || 2000) / 1000)}
                              defaultExpanded={false}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CSS for animations */}
      <style jsx>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
