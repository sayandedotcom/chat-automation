"use client";

import { useCallback, useEffect, useState } from "react";

import Image from "next/image";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { MarkdownEditor } from "@workspace/ui/components/tiptap-markdown-editor";
import { MarkdownRenderer } from "@workspace/ui/components/tiptap-markdown-renderer";
import { cn } from "@workspace/ui/lib/utils";

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
        "bubble overflow-hidden rounded-[2rem] border bg-[#1a1a1a] p-2",
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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
            <Image
              src="/integrations/google_docs.svg"
              alt="Google Docs"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">Create Document</span>
        </div>
        <div className="flex items-center gap-3">
          {actionTaken && (
            <div
              className={cn(
                "bubble flex h-5 w-5 items-center justify-center rounded-full"
                // actionTaken === "created" ? "bg-emerald-500/20" : "bg-white/10"
              )}>
              {actionTaken === "created" ? (
                <Check className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3 text-white/40" />
              )}
            </div>
          )}
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
      </div>

      {/* ── Collapsible content ── */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="collapsible"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden">
            <div className="px-5 py-5">
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
                <div className="scrollbar-thin scrollbar-thumb-[#2a2a2a] scrollbar-track-transparent scrollbar-thumb-rounded-full max-h-[420px] overflow-y-auto">
                  <MarkdownRenderer content={content} />
                </div>
              ) : (
                <MarkdownEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Document content..."
                  maxHeight={320}
                  className="scrollbar-thin scrollbar-thumb-[#2a2a2a] scrollbar-track-transparent scrollbar-thumb-rounded-full"
                />
              )}
            </div>

            {/* ── Footer ── */}
            {!actionTaken && (
              <div className="flex items-center justify-end gap-3 border-t border-white/10 px-4 py-3">
                <button
                  className="bubble mr-1 flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-zinc-100 backdrop-blur-md transition-all hover:scale-110"
                  tabIndex={-1}
                  title="Regenerate">
                  <RotateCcw className="h-4 w-4 drop-shadow-md" />
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isCreating}
                  className="bubble rounded-full bg-red-500/80 px-6 py-2.5 text-sm font-bold text-red-100 backdrop-blur-md transition-all hover:scale-105 focus:ring-2 focus:ring-red-500/50 focus:outline-none disabled:opacity-50">
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isCreating}
                  className="bubble flex items-center gap-2.5 rounded-full bg-violet-500/80 py-2.5 pr-3 pl-6 text-sm font-bold text-violet-100 backdrop-blur-md transition-all hover:scale-105 focus:ring-2 focus:ring-violet-500/50 focus:outline-none disabled:opacity-50">
                  {isCreating ? (
                    "Creating..."
                  ) : (
                    <>
                      Create
                      <div className="flex items-center gap-0.5 opacity-90">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[10px]">
                          ⌘
                        </span>
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-white/10 text-[10px]">
                          ↵
                        </span>
                      </div>
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
