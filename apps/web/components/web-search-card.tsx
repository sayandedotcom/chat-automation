"use client";

import { useEffect, useState } from "react";

import { Check, ChevronDown, ChevronUp, Globe, X } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

import { SearchResultsList, parseSearchResults } from "./search-results-list";
import type { SearchResultData, ToolCallPreview } from "./workflow-timeline";

interface WebSearchCardProps {
  toolCall: ToolCallPreview;
  stepNumber: number;
  onApprove: (
    stepNumber: number,
    action: "approve" | "edit" | "skip",
    content?: Record<string, unknown>
  ) => void;
  completed: boolean;
  searchResults?: SearchResultData[];
  result?: string;
}

function extractQueryLabel(toolCall: ToolCallPreview): { label: string; preview: string } {
  const args = toolCall.arguments;

  if (toolCall.tool_name === "tavily_search") {
    const query = String(args.query ?? "");
    return { label: query, preview: `Will search for: ${query}` };
  }

  if (toolCall.tool_name === "tavily_extract") {
    const urls = Array.isArray(args.urls) ? (args.urls as string[]) : [];
    if (urls.length === 0) {
      const single = String(args.url ?? "");
      return { label: single, preview: `Will extract: ${single}` };
    }
    const first = urls[0] ?? "";
    const rest = urls.length - 1;
    const label = rest > 0 ? `${first} +${rest} more` : first;
    return { label, preview: `Will extract: ${label}` };
  }

  const label = toolCall.tool_name;
  return { label, preview: `Will run: ${label}` };
}

export function WebSearchCard({
  toolCall,
  stepNumber,
  onApprove,
  completed,
  searchResults,
  result,
}: WebSearchCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [actionTaken, setActionTaken] = useState<"approved" | "skipped" | null>(
    completed ? "approved" : null
  );

  useEffect(() => {
    if (completed && !actionTaken) {
      setActionTaken("approved");
      setIsCollapsed(true);
    }
  }, [completed, actionTaken]);

  const { label, preview } = extractQueryLabel(toolCall);

  const handleApprove = () => {
    if (actionTaken) return;
    setActionTaken("approved");
    setIsCollapsed(true);
    onApprove(stepNumber, "approve");
  };

  const handleSkip = () => {
    if (actionTaken) return;
    setActionTaken("skipped");
    setIsCollapsed(true);
    onApprove(stepNumber, "skip");
  };

  // Build results list for completed state
  const results =
    searchResults && searchResults.length > 0
      ? searchResults
      : result
        ? parseSearchResults(result)
        : [];

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border bg-[#1a1a1a]",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        actionTaken
          ? "border-white/[0.06]"
          : "border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_8px_40px_-12px_rgba(0,0,0,0.6)]"
      )}>
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          !isCollapsed && "border-b border-white/5",
          actionTaken && "cursor-pointer transition-colors hover:bg-white/[0.02]"
        )}
        onClick={actionTaken ? () => setIsCollapsed(!isCollapsed) : undefined}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10">
            <Globe className="h-4 w-4 text-blue-400/80" />
          </div>
          <span className="text-sm font-medium text-white/90">Web Search</span>
          {label && <span className="max-w-[200px] truncate text-xs text-white/40">{label}</span>}
          {actionTaken && (
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full",
                actionTaken === "approved" ? "bg-emerald-500/20" : "bg-white/10"
              )}>
              {actionTaken === "approved" ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <X className="h-3 w-3 text-white/40" />
              )}
            </div>
          )}
          {completed && results.length > 0 && (
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-white/40">
              {results.length} result{results.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {actionTaken ? (
          <button className="flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/60">
            {isCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
            <span className="text-xs text-orange-400/80">Awaiting approval</span>
          </div>
        )}
      </div>

      {/* Body */}
      {!isCollapsed && (
        <div className="px-4 py-3">
          {!completed ? (
            // Awaiting approval view
            <div className="space-y-3">
              <p className="text-sm text-white/60">{preview}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleApprove}
                  className="h-8 bg-white/[0.08] px-4 text-xs text-white/80 hover:bg-white/[0.12]">
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleSkip}
                  className="h-8 px-4 text-xs text-white/40 hover:bg-white/[0.06] hover:text-white/60">
                  Skip
                </Button>
              </div>
            </div>
          ) : results.length > 0 ? (
            // Completed with results
            <SearchResultsList results={results} />
          ) : null}
        </div>
      )}
    </div>
  );
}
