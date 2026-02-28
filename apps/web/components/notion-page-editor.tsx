"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Check,
  X,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import Image from "next/image";
import { MarkdownEditor } from "./markdown-editor";
import { MarkdownRenderer } from "./markdown-renderer";
import type { ToolCallPreview } from "./workflow-timeline";

interface NotionPageEditorProps {
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

function extractTitle(args: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = args.properties as any;
  if (props) {
    const tryExtract = (field: unknown): string | null => {
      if (typeof field === "string") return field;
      if (Array.isArray(field) && field[0]?.text?.content)
        return field[0].text.content;
      if (field && typeof field === "object" && "title" in (field as Record<string, unknown>)) {
        const inner = (field as Record<string, unknown>).title;
        if (typeof inner === "string") return inner;
        if (Array.isArray(inner) && inner[0]?.text?.content)
          return inner[0].text.content;
      }
      return null;
    };

    const fromTitle = tryExtract(props.title);
    if (fromTitle) return fromTitle;
    const fromName = tryExtract(props.Name);
    if (fromName) return fromName;
  }

  if (typeof args.title === "string") return args.title;
  return "";
}

function extractContent(args: Record<string, unknown>): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = args.children as any[];
  if (!Array.isArray(children)) return "";

  const lines: string[] = [];
  for (const block of children) {
    const type = block.type || block.object;
    const data = block[type];
    if (data?.rich_text) {
      const text = data.rich_text
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((rt: any) => rt.text?.content ?? rt.plain_text ?? "")
        .join("");
      lines.push(text);
    } else if (typeof data === "string") {
      lines.push(data);
    }
  }
  return lines.join("\n");
}

export function NotionPageEditor({
  toolCall,
  stepNumber,
  onApprove,
  completed = false,
  className,
}: NotionPageEditorProps) {
  const args = toolCall.arguments;

  const [title, setTitle] = useState(() => extractTitle(args));
  const [content, setContent] = useState(() => extractContent(args));
  const [isCreating, setIsCreating] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [actionTaken, setActionTaken] = useState<"created" | "skipped" | null>(
    completed ? "created" : null,
  );

  useEffect(() => {
    if (completed && !actionTaken) {
      setActionTaken("created");
      setIsCollapsed(true);
    }
  }, [completed, actionTaken]);

  const isDirty = useCallback(() => {
    return title !== extractTitle(args) || content !== extractContent(args);
  }, [title, content, args]);

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
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
            <Image
              src="/integrations/notion.svg"
              alt="Notion"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">
            Create Page
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
          <div className="px-5 py-5 max-h-[420px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {/* Title */}
            {actionTaken ? (
              <h2 className="text-2xl font-bold text-white mb-4 leading-tight tracking-tight">
                {title}
              </h2>
            ) : (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Page title"
                className={cn(
                  "w-full bg-transparent outline-none mb-4",
                  "text-2xl font-bold text-white leading-tight tracking-tight",
                  "placeholder:text-white/25",
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
                placeholder="Page content..."
                maxHeight={320}
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
                className="px-4 h-9 bg-white text-black hover:bg-white/90 gap-2"
              >
                {isCreating ? (
                  "Creating..."
                ) : (
                  <>
                    Create
                    <span className="flex items-center gap-0.5 text-xs text-black/50">
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
