"use client";

import { useState, useEffect, useRef, useMemo } from "react";

import { cn } from "@workspace/ui/lib/utils";
import {
  X,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Globe,
  Shield,
  Mail,
  Calendar,
  FileText,
  Clock,
  Search,
  Check,
  Plus,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import Image from "next/image";
import { SearchResultsList, parseSearchResults } from "./search-results-list";
import { ThinkingIndicator } from "./thinking-indicator";
import { DocumentPreviewCard } from "./document-preview-card";

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

export interface WorkflowStep {
  step_number: number;
  description: string;
  status:
    | "pending"
    | "in_progress"
    | "completed"
    | "failed"
    | "skipped"
    | "awaiting_approval";
  result?: string;
  error?: string;
  tools_used?: string[];
  requires_human_approval?: boolean;
  approval_reason?: string;
  preview?: Record<string, unknown>; // Preview content for approval
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
    content?: Record<string, unknown>,
  ) => void;
  isComplete?: boolean;
  className?: string;
}

// Map tool IDs to integration icons
const toolIconMap: Record<string, string> = {
  "web-search": "/integrations/web_search.svg",
  notion: "/integrations/notion.svg",
  slack: "/integrations/slack.svg",
  gmail: "/integrations/gmail.svg",
  "google-drive": "/integrations/drive.svg",
  "google-docs": "/integrations/google_docs.svg",
  "google-calendar": "/integrations/google_calendar.svg",
  github: "/integrations/github_dark.svg",
  linear: "/integrations/linear.svg",
  vercel: "/integrations/vercel_dark.svg",
  supabase: "/integrations/supabase.svg",
  sentry: "/integrations/sentry.svg",
};

// Map tool IDs to display names
const toolNameMap: Record<string, string> = {
  "web-search": "Web Search",
  notion: "Notion",
  slack: "Slack",
  gmail: "Gmail",
  "google-drive": "Google Drive",
  "google-docs": "Google Docs",
  "google-calendar": "Google Calendar",
  github: "GitHub",
  linear: "Linear",
  vercel: "Vercel",
  supabase: "Supabase",
  sentry: "Sentry",
  general: "General",
};

// Tools that should show rich result cards (not simple status lines)
const richResultTools = new Set([
  "web-search",
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
    return <Mail className="w-4 h-4 text-white/50" />;
  }
  if (lowerDesc.includes("calendar") || tool === "google-calendar") {
    return <Calendar className="w-4 h-4 text-white/50" />;
  }
  if (
    lowerDesc.includes("document") ||
    lowerDesc.includes("notion") ||
    tool === "notion" ||
    tool === "google-docs"
  ) {
    return <FileText className="w-4 h-4 text-white/50" />;
  }
  if (lowerDesc.includes("time") || lowerDesc.includes("schedule")) {
    return <Clock className="w-4 h-4 text-white/50" />;
  }
  if (lowerDesc.includes("search") || tool === "web-search") {
    return <Search className="w-4 h-4 text-white/50" />;
  }
  if (lowerDesc.includes("vercel") || tool === "vercel") {
    return <Globe className="w-4 h-4 text-white/50" />;
  }

  // Default: simple dot
  return <div className="w-1.5 h-1.5 rounded-full bg-white/40" />;
}

// Check if a step should show a rich result card (with expandable content)
function shouldShowRichCard(step: WorkflowStep): boolean {
  const primaryTool = step.tools_used?.[0] || "general";

  // Always show card for web-search with results
  if (
    primaryTool === "web-search" &&
    (step.search_results?.length || step.result)
  ) {
    return true;
  }

  // Show card for rich result tools with substantial results
  if (
    richResultTools.has(primaryTool) &&
    step.result &&
    step.result.length > 100
  ) {
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
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());
  const [animatedSteps, setAnimatedSteps] = useState<Set<number>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);

  // Filter steps to only show visible ones (not pending) - memoized to prevent infinite loops
  const visibleSteps = useMemo(
    () => steps.filter((step) => step.status !== "pending"),
    [steps],
  );

  // Get stable identifiers for dependency tracking
  const visibleStepNumbers = visibleSteps.map((s) => s.step_number).join(",");
  const activeStepNumbers = visibleSteps
    .filter(
      (s) => s.status === "in_progress" || s.status === "awaiting_approval",
    )
    .map((s) => s.step_number)
    .join(",");

  // Track which steps have been animated (for entrance animation)
  useEffect(() => {
    setAnimatedSteps((prev) => {
      const newSet = new Set(prev);
      let hasNew = false;
      visibleSteps.forEach((step) => {
        if (!prev.has(step.step_number)) {
          newSet.add(step.step_number);
          hasNew = true;
        }
      });
      return hasNew ? newSet : prev;
    });
  }, [visibleStepNumbers]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand steps that are in_progress or awaiting_approval
  useEffect(() => {
    if (!activeStepNumbers) return;

    const activeIds = activeStepNumbers.split(",").map(Number);
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      let changed = false;
      activeIds.forEach((id) => {
        if (!prev.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [activeStepNumbers]);

  const toggleStep = (stepNumber: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      return next;
    });
  };

  if (steps.length === 0) {
    return null;
  }

  // Calculate timeline line height based on visible steps
  const lineHeight = visibleSteps.length > 0 ? `calc(100% - 12px)` : "0px";

  return (
    <div className={cn("w-full max-w-3xl mx-auto py-4", className)}>
      {/* Timeline with vertical line */}
      <div className="relative" ref={timelineRef}>
        {/* Animated vertical timeline line */}
        <div
          className="absolute left-[9px] top-3 w-[2px] bg-white/10 transition-all duration-500 ease-out"
          style={{ height: lineHeight }}
        />

        {/* Timeline items: thinking blocks, status messages, and steps */}
        <div className="space-y-3">
          {/* Initial thinking from planner */}
          {planThinking && (
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 relative z-10">
                <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-white/20 flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#9b7fdb]" />
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <ThinkingIndicator
                  content={planThinking}
                  duration={2}
                  defaultExpanded={false}
                />
              </div>
            </div>
          )}

          {/* Integration indicator (e.g., "Added 2 integrations successfully") */}
          {loadedIntegrations && loadedIntegrations.length > 0 && (
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 relative z-10">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-emerald-400">
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
                        className="opacity-60"
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
              <div className="flex-shrink-0 relative z-10">
                <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-white/20 flex items-center justify-center">
                  <Plus className="w-3 h-3 text-white/50" />
                </div>
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
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
            const isNewStep = !animatedSteps.has(step.step_number);

            return (
              <div
                key={step.step_number}
                className={cn(
                  "relative",
                  // Entrance animation for new steps
                  "animate-in fade-in slide-in-from-top-2 duration-400",
                )}
                style={{
                  animationDelay: isNewStep ? `${index * 100}ms` : "0ms",
                }}
              >
                {/* Step row with circle and content */}
                <div className="flex items-start gap-4">
                  {/* Left side - circle indicator on the timeline */}
                  <div className="flex-shrink-0 relative z-10">
                    {step.status === "in_progress" ? (
                      <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-white/40 flex items-center justify-center">
                        <Loader2 className="w-3 h-3 animate-spin text-white/60" />
                      </div>
                    ) : step.status === "awaiting_approval" ? (
                      <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-amber-500/50 flex items-center justify-center animate-pulse">
                        <Shield className="w-3 h-3 text-amber-400" />
                      </div>
                    ) : step.status === "failed" ? (
                      <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-red-500/50 flex items-center justify-center">
                        <X className="w-3 h-3 text-red-400" />
                      </div>
                    ) : step.status === "completed" ? (
                      <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-white/20 flex items-center justify-center">
                        {toolIcon ? (
                          <Image
                            src={toolIcon}
                            alt={primaryTool}
                            width={12}
                            height={12}
                            className="object-contain opacity-70"
                          />
                        ) : (
                          <Check className="w-3 h-3 text-white/50" />
                        )}
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-white/20 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                      </div>
                    )}
                  </div>

                  {/* Right side - content */}
                  <div className="flex-1 min-w-0">
                    {/* APPROVAL CARD */}
                    {step.status === "awaiting_approval" ? (
                      <div className="rounded-2xl bg-[#1a1a1a] border border-amber-500/30 overflow-hidden">
                        <div className="px-4 py-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Shield className="w-4 h-4 text-amber-400" />
                              <span className="text-sm font-medium text-amber-300">
                                Awaiting Approval
                              </span>
                            </div>
                            {onApprove && (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    onApprove(step.step_number, "approve")
                                  }
                                  className="h-7 px-3 text-xs border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/20 bg-transparent"
                                >
                                  ✓ Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    onApprove(step.step_number, "skip")
                                  }
                                  className="h-7 px-2 text-xs border-white/20 text-white/60 hover:bg-white/10 bg-transparent"
                                >
                                  Skip
                                </Button>
                              </div>
                            )}
                          </div>
                          <p className="text-sm text-white/60">
                            {step.description}
                          </p>
                          {step.approval_reason && (
                            <p className="text-xs text-amber-400/70 mt-1">
                              {step.approval_reason}
                            </p>
                          )}

                          {/* Content preview */}
                          {step.preview && (
                            <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                              {"title" in step.preview && step.preview.title ? (
                                <div className="text-sm">
                                  <span className="text-white/40">Title: </span>
                                  <span className="text-white/80">
                                    {String(step.preview.title)}
                                  </span>
                                </div>
                              ) : null}
                              {"content" in step.preview &&
                              step.preview.content ? (
                                <div className="text-sm text-white/60 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                  {typeof step.preview.content === "string"
                                    ? step.preview.content
                                    : JSON.stringify(step.preview.content)}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : step.status === "failed" ? (
                      /* FAILED STEP CARD */
                      <div className="rounded-2xl bg-[#1a1a1a] border border-red-500/30 overflow-hidden">
                        <div className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm text-red-300">
                              {step.description}
                            </p>
                            {onRetry && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => onRetry(step.step_number)}
                                className="h-7 px-2 text-xs border-red-500/50 text-red-400 hover:bg-red-500/20 bg-transparent"
                              >
                                <RotateCcw className="w-3 h-3 mr-1" />
                                Retry
                              </Button>
                            )}
                          </div>
                          {step.error && (
                            <p className="text-xs text-red-400/70 mt-2">
                              {step.error}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : isRichCard && step.status === "completed" ? (
                      /* RICH RESULT CARD (Web Search, etc.) */
                      <div className="space-y-2">
                        <div
                          className="rounded-2xl bg-[#1a1a1a] border border-white/10 overflow-hidden cursor-pointer"
                          onClick={() => toggleStep(step.step_number)}
                        >
                          {/* Card header with tool info */}
                          <div className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {toolIcon && (
                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center">
                                  <Image
                                    src={toolIcon}
                                    alt={primaryTool}
                                    width={14}
                                    height={14}
                                    className="object-contain"
                                  />
                                </div>
                              )}
                              <span className="text-sm font-medium text-white/90">
                                {toolNameMap[primaryTool] || primaryTool}
                              </span>
                            </div>
                            <button className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 transition-colors">
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-white/70" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-white/70" />
                              )}
                            </button>
                          </div>

                          {/* Expanded content */}
                          {isExpanded && (
                            <div className="px-4 pb-4 border-t border-white/5">
                              <div className="pt-3">
                                {step.error && (
                                  <div className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3">
                                    <strong>Error:</strong> {step.error}
                                  </div>
                                )}
                                {step.result && (
                                  <div className="space-y-2">
                                    {primaryTool === "web-search" ? (
                                      step.search_results &&
                                      step.search_results.length > 0 ? (
                                        <SearchResultsList
                                          results={step.search_results}
                                        />
                                      ) : (
                                        (() => {
                                          const parsed = parseSearchResults(
                                            step.result || "",
                                          );
                                          return parsed.length > 0 ? (
                                            <SearchResultsList
                                              results={parsed}
                                            />
                                          ) : (
                                            <div className="text-sm text-white/70 whitespace-pre-wrap">
                                              {step.result}
                                            </div>
                                          );
                                        })()
                                      )
                                    ) : (
                                      <div className="text-sm text-white/70 whitespace-pre-wrap">
                                        {step.result}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Per-step thinking for rich cards */}
                        {step.thinking && (
                          <ThinkingIndicator
                            content={step.thinking}
                            duration={Math.round(
                              (step.thinking_duration_ms || 2000) / 1000,
                            )}
                            defaultExpanded={false}
                          />
                        )}
                      </div>
                    ) : (
                      /* SIMPLE STATUS LINE (General messages - like image 3) */
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 py-0.5">
                          {getStatusIcon(primaryTool, step.description)}
                          <p
                            className={cn(
                              "text-sm",
                              step.status === "in_progress" && "text-white/60",
                              step.status === "completed" && "text-white/50",
                              step.status === "skipped" && "text-white/40",
                            )}
                          >
                            {step.description}
                            {step.status === "completed" &&
                              step.result &&
                              !isRichCard && (
                                <span className="text-white/30 ml-1">
                                  {step.result}
                                  {/* {step.result.length > 50
                                    ? ` - ${step.result.substring(0, 50)}...`
                                    : ` - ${step.result}`} */}
                                </span>
                              )}
                          </p>
                        </div>
                        {/* Per-step thinking */}
                        {step.thinking && (
                          <div className="ml-7">
                            <ThinkingIndicator
                              content={step.thinking}
                              duration={Math.round(
                                (step.thinking_duration_ms || 2000) / 1000,
                              )}
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
