"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Check, X } from "lucide-react";
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
    content?: Record<string, unknown>
  ) => void;
  completed?: boolean;
  className?: string;
}

function extractTitle(args: Record<string, unknown>): string {
  // Simple flat format (from edited content)
  if (typeof args.title === "string") return args.title;

  // Notion API format: properties.title or properties.Name
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = args.properties as any;
  if (props) {
    for (const key of ["title", "Title", "Name", "name"]) {
      const field = props[key];
      if (typeof field === "string") return field;
      if (Array.isArray(field) && field[0]?.text?.content) return field[0].text.content;
      if (field?.title) {
        if (typeof field.title === "string") return field.title;
        if (Array.isArray(field.title) && field.title[0]?.text?.content)
          return field.title[0].text.content;
      }
    }
  }

  return "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function richTextToMarkdown(richTexts: any[]): string {
  if (!Array.isArray(richTexts)) return "";
  return richTexts
    .map((rt) => {
      let text = rt.text?.content ?? rt.plain_text ?? "";
      if (!text) return "";
      const a = rt.annotations ?? {};
      if (a.code) text = `\`${text}\``;
      if (a.bold) text = `**${text}**`;
      if (a.italic) text = `*${text}*`;
      if (a.strikethrough) text = `~~${text}~~`;
      if (rt.text?.link?.url) text = `[${text}](${rt.text.link.url})`;
      return text;
    })
    .join("");
}

const LIST_TYPES = new Set([
  "bulleted_list_item", "numbered_list_item", "to_do",
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blockToMarkdown(block: any): { text: string; type: string } | null {
  const type: string = block.type || block.object;
  const data = block[type];
  if (!data) return null;

  const text = data.rich_text ? richTextToMarkdown(data.rich_text) : "";

  switch (type) {
    case "heading_1":
      return { text: `# ${text}`, type };
    case "heading_2":
      return { text: `## ${text}`, type };
    case "heading_3":
      return { text: `### ${text}`, type };
    case "bulleted_list_item":
      return { text: `- ${text}`, type };
    case "numbered_list_item":
      return { text: `1. ${text}`, type };
    case "to_do":
      return { text: `- [${data.checked ? "x" : " "}] ${text}`, type };
    case "quote":
      return { text: `> ${text}`, type };
    case "code":
      return { text: `\`\`\`${data.language ?? ""}\n${text}\n\`\`\``, type };
    case "divider":
      return { text: "---", type };
    case "paragraph":
    default:
      return { text, type: "paragraph" };
  }
}

function extractContent(args: Record<string, unknown>): string {
  // Simple flat format (from edited content)
  if (typeof args.content === "string") return args.content;

  // Notion API format: children array of block objects
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children = args.children as any[];
  if (!Array.isArray(children)) return "";

  const parts: { text: string; type: string }[] = [];
  for (const block of children) {
    const md = blockToMarkdown(block);
    if (md !== null) parts.push(md);
  }

  // Smart spacing: \n between consecutive list items, \n\n around headings/code/dividers
  let result = "";
  for (let idx = 0; idx < parts.length; idx++) {
    const cur = parts[idx]!;
    if (idx > 0) {
      const prev = parts[idx - 1]!;
      const bothList = LIST_TYPES.has(prev.type) && LIST_TYPES.has(cur.type);
      result += bothList ? "\n" : "\n\n";
    }
    result += cur.text;
  }
  return result;
}

/** Convert markdown string back to Notion block objects for the API. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function markdownToNotionBlocks(markdown: string): any[] {
  const lines = markdown.split("\n");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blocks: any[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Skip empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trimStart().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        type: "code",
        code: {
          rich_text: [{ type: "text", text: { content: codeLines.join("\n") } }],
          language: lang || "plain text",
        },
      });
      continue;
    }

    // Divider
    if (/^---+$/.test(line.trim())) {
      blocks.push({ type: "divider", divider: {} });
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length as 1 | 2 | 3;
      const type = `heading_${level}` as const;
      blocks.push({
        type,
        [type]: { rich_text: [{ type: "text", text: { content: headingMatch[2]! } }] },
      });
      i++;
      continue;
    }

    // Bulleted list
    if (line.match(/^[-*]\s+/)) {
      const text = line.replace(/^[-*]\s+/, "");
      // To-do item
      const todoMatch = text.match(/^\[([ xX])\]\s*(.*)/);
      if (todoMatch) {
        blocks.push({
          type: "to_do",
          to_do: {
            rich_text: [{ type: "text", text: { content: todoMatch[2] } }],
            checked: todoMatch[1] !== " ",
          },
        });
      } else {
        blocks.push({
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ type: "text", text: { content: text } }],
          },
        });
      }
      i++;
      continue;
    }

    // Numbered list
    const numberedMatch = line.match(/^\d+\.\s+(.+)/);
    if (numberedMatch) {
      blocks.push({
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [{ type: "text", text: { content: numberedMatch[1] } }],
        },
      });
      i++;
      continue;
    }

    // Quote
    if (line.startsWith("> ")) {
      blocks.push({
        type: "quote",
        quote: {
          rich_text: [{ type: "text", text: { content: line.slice(2) } }],
        },
      });
      i++;
      continue;
    }

    // Paragraph (default)
    blocks.push({
      type: "paragraph",
      paragraph: {
        rich_text: [{ type: "text", text: { content: line } }],
      },
    });
    i++;
  }

  return blocks;
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
    completed ? "created" : null
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
      // Convert markdown back to Notion API format so the page preserves structure
      const notionArgs: Record<string, unknown> = {
        properties: {
          title: [{ type: "text", text: { content: title } }],
        },
        children: markdownToNotionBlocks(content),
      };
      // Preserve parent from original args if present
      if (args.parent) notionArgs.parent = args.parent;
      onApprove(stepNumber, "edit", {
        tool_calls: [{ id: toolCall.id, arguments: notionArgs }],
      });
    } else {
      onApprove(stepNumber, "approve");
    }
  }, [title, content, args, isDirty, isCreating, actionTaken, onApprove, stepNumber, toolCall.id]);

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
        className
      )}
    >
      {/* ── Header ── */}
      <div
        className={cn(
          "px-4 py-3 flex items-center justify-between",
          !isCollapsed && "border-b border-white/5",
          actionTaken && "cursor-pointer hover:bg-white/[0.02] transition-colors"
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
          <span className="text-sm font-medium text-white/90">Create Page</span>
          {actionTaken && (
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center",
                actionTaken === "created" ? "bg-emerald-500/20" : "bg-white/10"
              )}
            >
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
