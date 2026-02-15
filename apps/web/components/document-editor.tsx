"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Check, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import Image from "next/image";
import type { ToolCallPreview } from "./workflow-timeline";

interface DocumentEditorProps {
  toolCall: ToolCallPreview;
  stepNumber: number;
  onApprove: (
    stepNumber: number,
    action: "approve" | "edit" | "skip",
    content?: Record<string, unknown>,
  ) => void;
  completed?: boolean;
  className?: string;
}

export function DocumentEditor({
  toolCall,
  stepNumber,
  onApprove,
  completed = false,
  className,
}: DocumentEditorProps) {
  const args = toolCall.arguments;

  const [title, setTitle] = useState(() => String(args.title ?? ""));
  const [content, setContent] = useState(() => String(args.content ?? ""));
  const [isCreating, setIsCreating] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [actionTaken, setActionTaken] = useState<"created" | "skipped" | null>(
    completed ? "created" : null,
  );

  const contentRef = useRef<HTMLTextAreaElement>(null);

  // When completed prop changes externally, collapse
  useEffect(() => {
    if (completed && !actionTaken) {
      setActionTaken("created");
      setIsCollapsed(true);
    }
  }, [completed, actionTaken]);

  const isDirty = useCallback(() => {
    if (title !== String(args.title ?? "")) return true;
    if (content !== String(args.content ?? "")) return true;
    return false;
  }, [title, content, args]);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 400) + "px";
    }
  }, [content]);

  const handleCreate = useCallback(() => {
    if (isCreating || actionTaken) return;
    setIsCreating(true);
    setActionTaken("created");
    setIsCollapsed(true);

    if (isDirty()) {
      onApprove(stepNumber, "edit", {
        tool_calls: [
          { id: toolCall.id, arguments: { title, content } },
        ],
      });
    } else {
      onApprove(stepNumber, "approve");
    }
  }, [title, content, isDirty, isCreating, actionTaken, onApprove, stepNumber, toolCall.id]);

  const handleCancel = useCallback(() => {
    if (actionTaken) return;
    setActionTaken("skipped");
    setIsCollapsed(true);
    onApprove(stepNumber, "skip");
  }, [onApprove, stepNumber, actionTaken]);

  // Cmd+Enter / Ctrl+Enter
  useEffect(() => {
    if (actionTaken) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleCreate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCreate, actionTaken]);

  return (
    <div
      className={cn(
        "rounded-2xl bg-[#1a1a1a] border overflow-hidden",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        actionTaken
          ? "border-white/[0.06]"
          : "border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_8px_40px_-12px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "px-4 py-3 flex items-center justify-between",
          !isCollapsed && "border-b border-white/5",
          actionTaken && "cursor-pointer hover:bg-white/[0.02] transition-colors",
        )}
        onClick={actionTaken ? () => setIsCollapsed(!isCollapsed) : undefined}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
            <Image
              src="/integrations/google_docs.svg"
              alt="Google Docs"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">
            Create Document
          </span>
          {actionTaken && (
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center",
              actionTaken === "created"
                ? "bg-emerald-500/20"
                : "bg-white/10",
            )}>
              {actionTaken === "created" ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <X className="w-3 h-3 text-white/40" />
              )}
            </div>
          )}
        </div>
        {actionTaken ? (
          <button className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors">
            {isCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <button className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors">
            <span>Permissions</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Collapsible content ── */}
      {!isCollapsed && (
        <>
          <div className="px-4 py-4 max-h-[420px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {/* Title */}
            {actionTaken ? (
              <h3 className="text-xl font-semibold text-white mb-3 leading-tight">
                {title}
              </h3>
            ) : (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
                className={cn(
                  "w-full bg-transparent outline-none mb-3",
                  "text-xl font-semibold text-white leading-tight",
                  "placeholder:text-white/25",
                )}
              />
            )}

            {/* Content */}
            {actionTaken ? (
              <div className="prose prose-sm prose-invert max-w-none">
                <div className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
                  {content}
                </div>
              </div>
            ) : (
              <textarea
                ref={contentRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Document content..."
                rows={6}
                className={cn(
                  "w-full bg-transparent text-sm text-white/70 placeholder:text-white/25",
                  "outline-none resize-none leading-relaxed",
                  "max-h-[320px] overflow-y-auto",
                )}
              />
            )}
          </div>

          {/* ── Footer ── */}
          {!actionTaken && (
            <div className="px-4 py-2.5 flex items-center justify-center gap-2 border-t border-white/5 bg-[#151515]">
              <button
                className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                tabIndex={-1}
                title="Regenerate"
              >
                <RotateCcw className="w-4 h-4 text-white/40" />
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isCreating}
                className="px-4 h-9 bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-red-200"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isCreating}
                className="px-4 h-9 bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {isCreating ? (
                  "Creating..."
                ) : (
                  <>
                    Create
                    <span className="flex items-center gap-0.5 text-xs text-white/60">
                      <span className="text-[10px]">⌘</span>
                      <span>↵</span>
                    </span>
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
