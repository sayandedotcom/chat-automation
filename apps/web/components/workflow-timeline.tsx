"use client";

import { useState, useEffect, useMemo } from "react";

import { cn } from "@workspace/ui/lib/utils";
import {
  X,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Globe,
  Shield,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import Image from "next/image";
import { SearchResultsList, parseSearchResults } from "./search-results-list";

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
}

interface WorkflowTimelineProps {
  steps: WorkflowStep[];
  currentStep: number;
  onRetry?: (stepNumber: number) => void;
  onApprove?: (
    stepNumber: number,
    action: "approve" | "edit" | "skip",
    content?: Record<string, unknown>
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

export function WorkflowTimeline({
  steps,
  currentStep,
  onRetry,
  onApprove,
  isComplete,
  className,
}: WorkflowTimelineProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  // Auto-expand steps that are in_progress or awaiting_approval
  useEffect(() => {
    const activeSteps = steps.filter(
      (s) => s.status === "in_progress" || s.status === "awaiting_approval"
    );
    if (activeSteps.length > 0) {
      setExpandedSteps((prev) => {
        const next = new Set(prev);
        activeSteps.forEach((s) => next.add(s.step_number));
        return next;
      });
    }
  }, [steps]);

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

  return (
    <div className={cn("w-full max-w-3xl mx-auto py-4", className)}>
      {/* Timeline with vertical line */}
      <div className="relative">
        {/* Vertical timeline line */}
        <div className="absolute left-[9px] top-3 bottom-3 w-[2px] bg-white/10" />

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, index) => {
            const isExpanded = expandedSteps.has(step.step_number);
            const hasContent = step.result || step.error;
            const primaryTool = step.tools_used?.[0] || "general";
            const toolIcon = toolIconMap[primaryTool];
            const isResultCard = hasContent && step.status === "completed";
            const isLast = index === steps.length - 1;

            return (
              <div key={step.step_number} className="relative">
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
                    ) : toolIcon && step.status === "completed" ? (
                      <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-white/20 flex items-center justify-center">
                        <Image
                          src={toolIcon}
                          alt={primaryTool}
                          width={12}
                          height={12}
                          className="object-contain opacity-70"
                        />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-[#0a0a0a] border-2 border-white/20 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                      </div>
                    )}
                  </div>

                  {/* Right side - content */}
                  <div className="flex-1 min-w-0">
                    {/* Check if this is just a process indicator or has result content */}
                    {isResultCard ? (
                      // Result card - solid black with border like "Web Search" card in image 2
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
                                          step.result || ""
                                        );
                                        return parsed.length > 0 ? (
                                          <SearchResultsList results={parsed} />
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
                    ) : step.status === "awaiting_approval" ? (
                      // Approval card - similar styling
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
                              {"title" in step.preview &&
                                step.preview.title && (
                                  <div className="text-sm">
                                    <span className="text-white/40">
                                      Title:{" "}
                                    </span>
                                    <span className="text-white/80">
                                      {String(step.preview.title)}
                                    </span>
                                  </div>
                                )}
                              {"content" in step.preview &&
                                step.preview.content && (
                                  <div className="text-sm text-white/60 max-h-32 overflow-y-auto whitespace-pre-wrap">
                                    {typeof step.preview.content === "string"
                                      ? step.preview.content
                                      : JSON.stringify(step.preview.content)}
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : step.status === "failed" ? (
                      // Error card
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
                    ) : (
                      // Simple text for pending/in-progress steps - no card, just text
                      <p
                        className={cn(
                          "text-sm py-0.5",
                          step.status === "pending" && "text-white/40",
                          step.status === "in_progress" && "text-white/60",
                          step.status === "completed" &&
                            !hasContent &&
                            "text-white/60"
                        )}
                      >
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
