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
    // Check common keys first
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

    // Fallback: scan ALL properties for any with Notion's type:"title" or a title array
    // Handles databases with custom title columns like "Task", "Project", etc.
    for (const [, value] of Object.entries(props)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const field = value as any;
      if (!field || typeof field !== "object") continue;
      if (field.type === "title" && Array.isArray(field.title)) {
        if (field.title[0]?.text?.content) return field.title[0].text.content;
        if (field.title[0]?.plain_text) return field.title[0].plain_text;
      }
      // Also check for bare title arrays (without type wrapper)
      if (Array.isArray(field) && field[0]?.type === "text" && field[0]?.text?.content) {
        return field[0].text.content;
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

const LIST_TYPES = new Set(["bulleted_list_item", "numbered_list_item", "to_do"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const KNOWN_BLOCK_TYPES = new Set([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
  "to_do",
  "quote",
  "code",
  "divider",
]);

function blockToMarkdown(block: any): { text: string; type: string } | null {
  // Infer type: explicit type field, then object field, then probe for known block keys
  let type: string = block.type || block.object;
  if (!type) {
    for (const key of KNOWN_BLOCK_TYPES) {
      if (block[key]) {
        type = key;
        break;
      }
    }
  }

  // Handle top-level rich_text (no wrapping block key) as paragraph
  if (!type && Array.isArray(block.rich_text)) {
    const text = richTextToMarkdown(block.rich_text);
    return { text, type: "paragraph" };
  }

  if (!type) return null;

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
              src="/integrations/notion.svg"
              alt="Notion"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">Create Page</span>
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
                  placeholder="Page title"
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
                  placeholder="Page content..."
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
