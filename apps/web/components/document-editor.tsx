"use client";

import { useCallback, useEffect, useState } from "react";

import Image from "next/image";

import { Check, ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

import { MarkdownEditor } from "./markdown-editor";
import { MarkdownRenderer } from "./markdown-renderer";
import type { ToolCallPreview } from "./workflow-timeline";

interface DocumentEditorProps {
  toolCall: ToolCallPreview;
  stepNumber: number;
  onApprove: (
    stepNumber: number,
    action: "approve" | "edit" | "skip",
    content?: Record<string, unknown>
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
    completed ? "created" : null
  );

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

  const handleCreate = useCallback(() => {
    if (isCreating || actionTaken) return;
    setIsCreating(true);
    setActionTaken("created");
    setIsCollapsed(true);

    if (isDirty()) {
      onApprove(stepNumber, "edit", {
        tool_calls: [{ id: toolCall.id, arguments: { title, content } }],
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
        "overflow-hidden rounded-2xl border bg-[#1a1a1a]",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        actionTaken
          ? "border-white/[0.06]"
          : "border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_8px_40px_-12px_rgba(0,0,0,0.6)]",
        className
      )}>
      {/* ── Header ── */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3",
          !isCollapsed && "border-b border-white/5",
          actionTaken && "cursor-pointer transition-colors hover:bg-white/[0.02]"
        )}
        onClick={actionTaken ? () => setIsCollapsed(!isCollapsed) : undefined}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15">
            <Image
              src="/integrations/google_docs.svg"
              alt="Google Docs"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">Create Document</span>
          {actionTaken && (
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full",
                actionTaken === "created" ? "bg-emerald-500/20" : "bg-white/10"
              )}>
              {actionTaken === "created" ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <X className="h-3 w-3 text-white/40" />
              )}
            </div>
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
          <button className="flex items-center gap-1.5 text-xs text-white/40 transition-colors hover:text-white/60">
            <span>Permissions</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Collapsible content ── */}
      {!isCollapsed && (
        <>
          <div className="scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent max-h-[420px] overflow-y-auto px-5 py-5">
            {/* Title */}
            {actionTaken ? (
              <h2 className="mb-4 text-2xl leading-tight font-bold tracking-tight text-white">
                {title}
              </h2>
            ) : (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title"
                className={cn(
                  "mb-4 w-full bg-transparent outline-none",
                  "text-2xl leading-tight font-bold tracking-tight text-white",
                  "placeholder:text-white/25"
                )}
              />
            )}

            {/* Content */}
            {actionTaken ? (
              <MarkdownRenderer content={content} />
            ) : (
              <MarkdownEditor
                value={content}
                onChange={setContent}
                placeholder="Document content..."
                maxHeight={320}
              />
            )}
          </div>

          {/* ── Footer ── */}
          {!actionTaken && (
            <div className="flex items-center justify-center gap-2 border-t border-white/5 bg-[#151515] px-4 py-2.5">
              <button
                className="rounded-lg p-2 transition-colors hover:bg-white/5"
                tabIndex={-1}
                title="Regenerate">
                <RotateCcw className="h-4 w-4 text-white/40" />
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isCreating}
                className="h-9 border-red-500/30 bg-red-500/20 px-4 text-red-300 hover:bg-red-500/30 hover:text-red-200">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={isCreating}
                className="h-9 gap-2 bg-purple-600 px-4 text-white hover:bg-purple-700">
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
