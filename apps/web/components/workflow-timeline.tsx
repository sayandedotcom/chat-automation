"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Image from "next/image";

import {
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  Globe,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { MarkdownRenderer } from "@workspace/ui/components/tiptap-markdown-renderer";
import { cn } from "@workspace/ui/lib/utils";

import {
  toolIconMap as configToolIconMap,
  toolNameMap as configToolNameMap,
} from "@/config/integrations";

import { CalendarEventEditor } from "./calendar-event-editor";
import { DocumentEditor } from "./document-editor";
import { EmailComposer } from "./email-composer";
import { NotionPageEditor } from "./notion-page-editor";
import { SearchResultsList, parseSearchResults } from "./search-results-list";
import { SheetsEditor } from "./sheets-editor";
import { ThinkingIndicator } from "./thinking-indicator";
import { WebSearchCard } from "./web-search-card";

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

// Tools that should show rich result cards (not simple status lines)
const richResultTools = new Set([
  "web-search",
  "tavily_search",
  "tavily_extract",
  "tavily_crawl",
  "notion",
  "slack",
  "github",
  "linear",
  "vercel",
  "supabase",
]);

// Get icon component for simple status messages
function getStatusIcon(tool: string, description: string) {
  // Check description for context
  const lowerDesc = description.toLowerCase();

  if (lowerDesc.includes("email") || tool === "gmail") {
    return <Mail className="h-4 w-4 text-white/50" />;
  }
  if (lowerDesc.includes("calendar") || tool === "google-calendar") {
    return <Calendar className="h-4 w-4 text-white/50" />;
  }
  if (
    lowerDesc.includes("document") ||
    lowerDesc.includes("notion") ||
    tool === "notion" ||
    tool === "google-docs"
  ) {
    return <FileText className="h-4 w-4 text-white/50" />;
  }
  if (lowerDesc.includes("time") || lowerDesc.includes("schedule")) {
    return <Clock className="h-4 w-4 text-white/50" />;
  }
  if (lowerDesc.includes("search") || tool === "web-search") {
    return <Search className="h-4 w-4 text-white/50" />;
  }
  if (lowerDesc.includes("vercel") || tool === "vercel") {
    return <Globe className="h-4 w-4 text-white/50" />;
  }

  // Default: simple dot
  return <div className="h-1.5 w-1.5 rounded-full bg-white/40" />;
}

// Check if a step should show a rich result card (with expandable content)
function shouldShowRichCard(step: WorkflowStep): boolean {
  const primaryTool = step.tools_used?.[0] || "general";

  // Structured search results → always show rich card (tools_used may be empty)
  if (step.search_results && step.search_results.length > 0) {
    console.log(
      `🃏 [RICH-CARD] Step ${step.step_number}: YES (search_results present, count=${step.search_results.length})`
    );
    return true;
  }

  // Always show card for web-search with results
  if (primaryTool === "web-search" && (step.search_results?.length || step.result)) {
    console.log(`🃏 [RICH-CARD] Step ${step.step_number}: YES (web-search with results)`);
    return true;
  }

  // Show card for rich result tools with substantial results
  if (richResultTools.has(primaryTool) && step.result && step.result.length > 100) {
    console.log(
      `🃏 [RICH-CARD] Step ${step.step_number}: YES (${primaryTool} with ${step.result.length} chars)`
    );
    return true;
  }

  if (richResultTools.has(primaryTool)) {
    console.log(
      `🃏 [RICH-CARD] Step ${step.step_number}: NO (${primaryTool} is rich-eligible but result_len=${step.result?.length || 0} < 100)`
    );
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
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
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

  // Get stable identifiers for dependency tracking
  const visibleStepNumbers = visibleSteps.map((s) => s.step_number).join(",");
  const activeStepNumbers = visibleSteps
    .filter((s) => s.status === "in_progress" || s.status === "awaiting_approval")
    .map((s) => s.step_number)
    .join(",");

  // Auto-expand steps that are in_progress or awaiting_approval
  useEffect(() => {
    if (!activeStepNumbers) return;

    const activeIds = activeStepNumbers.split(",").map(Number);
    console.log(`🔽 [COLLAPSE] Auto-expanding active steps: [${activeIds.join(", ")}]`);
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      let changed = false;
      activeIds.forEach((id) => {
        if (!prev.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      if (changed) {
        console.log(`🔽 [COLLAPSE] expandedSteps updated: [${Array.from(next).join(", ")}]`);
      }
      return changed ? next : prev;
    });
  }, [activeStepNumbers]);

  // Debug: log expandedSteps changes
  useEffect(() => {
    console.log(`🔽 [COLLAPSE] Current expandedSteps: [${Array.from(expandedSteps).join(", ")}]`);
  }, [expandedSteps]);

  const toggleStep = (stepNumber: number) => {
    console.log(`🔽 [COLLAPSE] User toggled step ${stepNumber}`);
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      console.log(`🔽 [COLLAPSE] After toggle: [${Array.from(next).join(", ")}]`);
      return next;
    });
  };

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
                <ThinkingIndicator content={planThinking} duration={2} defaultExpanded={false} />
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
            const isExpanded = expandedSteps.has(step.step_number);
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
              renderBranch = "generic-approval";
            } else if (step.status === "failed") {
              renderBranch = "failed-card";
            } else if (isRichCard && step.status === "completed") {
              renderBranch = `rich-card(tool=${primaryTool}, expanded=${isExpanded})`;
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
                        const integration = step.tool_calls?.[0]?.integration;
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
                        const integration = primaryToolCall?.integration;
                        const isCompleted = step.status !== "awaiting_approval";
                        console.log(
                          `🎨 [TOOL-CARD] Step ${step.step_number}: integration="${integration}", tool="${primaryToolCall?.tool_name}", isCompleted=${isCompleted}, hasOnApprove=${!!onApprove}`
                        );

                        // Gmail → EmailComposer
                        if (
                          integration === "gmail" &&
                          primaryToolCall &&
                          (onApprove || isCompleted)
                        ) {
                          return (
                            <div className="space-y-2">
                              <EmailComposer
                                toolCall={primaryToolCall}
                                stepNumber={step.step_number}
                                onApprove={onApprove || (() => {})}
                                completed={isCompleted}
                              />
                              {isCompleted && step.result && (
                                <div className="mt-2 text-sm text-gray-300">
                                  <MarkdownRenderer content={step.result} />
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Google Docs → DocumentEditor
                        if (
                          integration === "google_docs" &&
                          primaryToolCall &&
                          (onApprove || isCompleted)
                        ) {
                          return (
                            <div className="space-y-2">
                              <DocumentEditor
                                toolCall={primaryToolCall}
                                stepNumber={step.step_number}
                                onApprove={onApprove || (() => {})}
                                completed={isCompleted}
                              />
                              {isCompleted && step.result && (
                                <div className="mt-2 text-sm text-gray-300">
                                  <MarkdownRenderer content={step.result} />
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Notion → NotionPageEditor
                        if (
                          integration === "notion" &&
                          primaryToolCall &&
                          (onApprove || isCompleted)
                        ) {
                          return (
                            <div className="space-y-2">
                              <NotionPageEditor
                                toolCall={primaryToolCall}
                                stepNumber={step.step_number}
                                onApprove={onApprove || (() => {})}
                                completed={isCompleted}
                              />
                              {isCompleted && step.result && (
                                <div className="mt-2 text-sm text-gray-300">
                                  <MarkdownRenderer content={step.result} />
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Google Calendar → CalendarEventEditor
                        if (
                          integration === "google_calendar" &&
                          primaryToolCall &&
                          (onApprove || isCompleted)
                        ) {
                          return (
                            <div className="space-y-2">
                              <CalendarEventEditor
                                toolCall={primaryToolCall}
                                stepNumber={step.step_number}
                                onApprove={onApprove || (() => {})}
                                completed={isCompleted}
                                userHint={step.description}
                              />
                              {isCompleted && step.result && (
                                <div className="mt-2 text-sm text-gray-300">
                                  <MarkdownRenderer content={step.result} />
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Google Sheets → SheetsEditor (only for create_spreadsheet)
                        if (
                          integration === "google_sheets" &&
                          primaryToolCall &&
                          step.tool_calls!.some((tc) => tc.tool_name === "create_spreadsheet") &&
                          (onApprove || isCompleted)
                        ) {
                          return (
                            <div className="space-y-2">
                              <SheetsEditor
                                toolCalls={step.tool_calls!}
                                stepNumber={step.step_number}
                                onApprove={onApprove || (() => {})}
                                completed={isCompleted}
                              />
                              {isCompleted && step.result && (
                                <div className="mt-2 text-sm text-gray-300">
                                  <MarkdownRenderer content={step.result} />
                                </div>
                              )}
                            </div>
                          );
                        }

                        // Web Search → WebSearchCard
                        if (
                          integration === "web_search" &&
                          primaryToolCall &&
                          (onApprove || isCompleted)
                        ) {
                          return (
                            <div className="space-y-2">
                              <WebSearchCard
                                toolCall={primaryToolCall}
                                stepNumber={step.step_number}
                                onApprove={onApprove || (() => {})}
                                completed={isCompleted}
                                searchResults={step.search_results}
                              />
                              {isCompleted && step.result && (
                                <div className="mt-1 text-sm text-gray-300">
                                  <MarkdownRenderer content={step.result} />
                                </div>
                              )}
                            </div>
                          );
                        }

                        // All integrations have tool-specific UI above — no fallback needed
                        console.warn(
                          `⚠️ [TOOL-CARD] Step ${step.step_number}: No matching editor for integration="${integration}", tool="${primaryToolCall?.tool_name}" — rendering NULL`
                        );
                        return null;
                      })()
                    ) : step.status === "awaiting_approval" ? (
                      // Generic approval card (no tool_calls) — with Google Calendar fallback
                      (() => {
                        const descLower = step.description.toLowerCase();
                        const isCalendarCreate =
                          (descLower.includes("google calendar") ||
                            descLower.includes("calendar event") ||
                            descLower.includes("calendar")) &&
                          (descLower.includes("create") ||
                            descLower.includes("add") ||
                            descLower.includes("schedule") ||
                            descLower.includes("new event") ||
                            descLower.includes("invite"));

                        if (isCalendarCreate && onApprove) {
                          // Extract any email addresses mentioned in the description
                          const emailMatches =
                            step.description.match(/[\w.+%-]+@[\w-]+\.[\w.]+/g) || [];

                          // Default start = next full hour, end = 1h after
                          const now = new Date();
                          const defaultStart = new Date(now);
                          defaultStart.setHours(now.getHours() + 1, 0, 0, 0);
                          const defaultEnd = new Date(defaultStart);
                          defaultEnd.setHours(defaultStart.getHours() + 1, 0, 0, 0);

                          const syntheticToolCall: ToolCallPreview = {
                            id: `synthetic_calendar_${step.step_number}`,
                            tool_name: "create_event",
                            integration: "google_calendar",
                            arguments: {
                              summary: "New Event",
                              calendarId: "primary",
                              start: {
                                dateTime: defaultStart.toISOString(),
                              },
                              end: {
                                dateTime: defaultEnd.toISOString(),
                              },
                              attendees: emailMatches.map((email) => ({
                                email,
                              })),
                            },
                          };

                          return (
                            <CalendarEventEditor
                              toolCall={syntheticToolCall}
                              stepNumber={step.step_number}
                              onApprove={onApprove}
                              userHint={step.description}
                            />
                          );
                        }

                        // All integrations have tool-specific UI — no generic fallback needed
                        console.warn(
                          `⚠️ [GENERIC-APPROVAL] Step ${step.step_number}: No matching generic editor for desc="${step.description.slice(0, 80)}" — rendering NULL`
                        );
                        return null;
                      })()
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
                      /* RICH RESULT CARD (Web Search, etc.) */
                      <div className="space-y-2">
                        {step.search_results && step.search_results.length > 0 ? (
                          /* Web Search — use WebSearchCard + result summary */
                          <>
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
                            {step.result && (
                              <div className="mt-1 text-sm text-gray-300">
                                <MarkdownRenderer content={step.result} />
                              </div>
                            )}
                          </>
                        ) : (
                          /* Generic rich card for other tools */
                          <div
                            className="cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a]"
                            onClick={() => toggleStep(step.step_number)}>
                            {/* Card header with tool info */}
                            <div className="flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-3">
                                {toolIcon && (
                                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10">
                                    <Image
                                      src={toolIcon}
                                      alt={primaryTool}
                                      width={14}
                                      height={14}
                                      className="object-contain opacity-80 grayscale"
                                    />
                                  </div>
                                )}
                                <span className="text-sm font-medium text-white/90">
                                  {toolNameMap[primaryTool] || primaryTool}
                                </span>
                              </div>
                              <button className="rounded-lg bg-white/5 p-1.5 transition-colors hover:bg-white/15">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-white/70" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-white/70" />
                                )}
                              </button>
                            </div>

                            {/* Expanded content */}
                            {isExpanded && (
                              <div className="border-t border-white/5 px-4 pb-4">
                                <div className="pt-3">
                                  {step.error && (
                                    <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                                      <strong>Error:</strong> {step.error}
                                    </div>
                                  )}
                                  {step.result && (
                                    <div className="space-y-2">
                                      <MarkdownRenderer content={step.result} />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
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
                          {/* {getStatusIcon(primaryTool, step.description)} */}
                          <div
                            className={cn(
                              "text-sm",
                              step.status === "in_progress" && "text-white/60",
                              step.status === "completed" && "text-white/50",
                              step.status === "skipped" && "text-white/40"
                            )}>
                            <span>{step.description}</span>
                            {step.status === "completed" && step.result && !isRichCard && (
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
