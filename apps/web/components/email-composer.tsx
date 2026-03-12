"use client";

import { useCallback, useEffect, useState } from "react";

import Image from "next/image";

import { AnimatePresence, motion } from "framer-motion";
import {
  AtSign,
  Bold,
  Check,
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  Italic,
  List,
  ListOrdered,
  Network,
  Paperclip,
  RotateCcw,
  RotateCw,
  Strikethrough,
  Users,
  X,
} from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { MarkdownEditor } from "@workspace/ui/components/tiptap-markdown-editor";
import { MarkdownRenderer } from "@workspace/ui/components/tiptap-markdown-renderer";
import { cn } from "@workspace/ui/lib/utils";

import type { ToolCallPreview } from "./workflow-timeline";

interface EmailComposerProps {
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

function parseRecipients(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function EmailComposer({
  toolCall,
  stepNumber,
  onApprove,
  completed = false,
  className,
}: EmailComposerProps) {
  const args = toolCall.arguments;

  const [toList, setToList] = useState<string[]>(() => parseRecipients(args.to));
  const [ccList, setCcList] = useState<string[]>(() => parseRecipients(args.cc));
  const [bccList, setBccList] = useState<string[]>(() => parseRecipients(args.bcc));
  const [subject, setSubject] = useState(() => String(args.subject ?? ""));
  const [body, setBody] = useState(() => String(args.body ?? ""));

  const [showCcBcc, setShowCcBcc] = useState(() => ccList.length > 0 || bccList.length > 0);
  const [toInput, setToInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [actionTaken, setActionTaken] = useState<"sent" | "skipped" | null>(
    completed ? "sent" : null
  );

  // When completed prop changes externally, collapse
  useEffect(() => {
    if (completed && !actionTaken) {
      setActionTaken("sent");
      setIsCollapsed(true);
    }
  }, [completed, actionTaken]);

  const isDirty = useCallback(() => {
    const origTo = parseRecipients(args.to);
    const origCc = parseRecipients(args.cc);
    const origBcc = parseRecipients(args.bcc);
    if (toList.join(",") !== origTo.join(",")) return true;
    if (ccList.join(",") !== origCc.join(",")) return true;
    if (bccList.join(",") !== origBcc.join(",")) return true;
    if (subject !== String(args.subject ?? "")) return true;
    if (body !== String(args.body ?? "")) return true;
    return false;
  }, [toList, ccList, bccList, subject, body, args]);

  const handleSend = useCallback(() => {
    if (isSending || actionTaken) return;
    setIsSending(true);
    setActionTaken("sent");
    setIsCollapsed(true);

    const currentArgs: Record<string, unknown> = {
      to: toList.join(", "),
      subject,
      body,
    };
    if (ccList.length > 0) currentArgs.cc = ccList.join(", ");
    if (bccList.length > 0) currentArgs.bcc = bccList.join(", ");

    if (isDirty()) {
      onApprove(stepNumber, "edit", {
        tool_calls: [{ id: toolCall.id, arguments: currentArgs }],
      });
    } else {
      onApprove(stepNumber, "approve");
    }
  }, [
    toList,
    ccList,
    bccList,
    subject,
    body,
    isDirty,
    isSending,
    actionTaken,
    onApprove,
    stepNumber,
    toolCall.id,
  ]);

  const handleCancel = useCallback(() => {
    if (actionTaken) return;
    setActionTaken("skipped");
    setIsCollapsed(true);
    onApprove(stepNumber, "skip");
  }, [onApprove, stepNumber, actionTaken]);

  // Keyboard shortcut
  useEffect(() => {
    if (actionTaken) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSend, actionTaken]);

  // Chip helpers
  const addChip = (
    value: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void
  ) => {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
    setInput("");
  };

  const removeChip = (index: number, list: string[], setList: (v: string[]) => void) => {
    setList(list.filter((_, i) => i !== index));
  };

  const handleChipKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    inputValue: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void
  ) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addChip(inputValue, list, setList, setInput);
    }
    if (e.key === "Backspace" && inputValue === "" && list.length > 0) {
      removeChip(list.length - 1, list, setList);
    }
  };

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
              src="/integrations/gmail.svg"
              alt="Gmail"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">Write E-Mail</span>
        </div>
        <div className="flex items-center gap-3">
          {actionTaken && (
            <div
              className={cn(
                "bubble flex h-5 w-5 items-center justify-center rounded-full"
                // actionTaken === "sent" ? "bg-emerald-500/20" : "bg-white/10"
              )}>
              {actionTaken === "sent" ? (
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
            {/* ── Recipients ── */}
            <div className="border-b border-white/5">
              {/* To */}
              <div className="flex items-start gap-3 px-4 py-2.5">
                <Users className="mt-1.5 h-4 w-4 shrink-0 text-white/30" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {toList.map((email, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1.5 rounded-full border border-white/10 bg-zinc-800/40 px-3 py-1 text-sm text-zinc-200 shadow-sm">
                      {email}
                      {!actionTaken && (
                        <button
                          onClick={() => removeChip(i, toList, setToList)}
                          className="bubble rounded-full p-0.5 text-white transition-colors hover:text-white/70">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                  {!actionTaken && (
                    <input
                      type="text"
                      value={toInput}
                      onChange={(e) => setToInput(e.target.value)}
                      onKeyDown={(e) =>
                        handleChipKeyDown(e, toInput, toList, setToList, setToInput)
                      }
                      onBlur={() => {
                        if (toInput.trim()) addChip(toInput, toList, setToList, setToInput);
                      }}
                      placeholder={toList.length === 0 ? "Add recipient..." : ""}
                      className="min-w-[120px] flex-1 bg-transparent py-1 text-sm font-medium text-white/80 outline-none placeholder:text-white/25"
                    />
                  )}
                  {!actionTaken && !showCcBcc && (
                    <button
                      onClick={() => setShowCcBcc(true)}
                      className="ml-auto shrink-0 text-[11px] tracking-wide text-white/30 uppercase transition-colors hover:text-white/50">
                      CC / BCC
                    </button>
                  )}
                </div>
              </div>

              {/* CC / BCC */}
              {showCcBcc && (
                <>
                  <div className="flex items-start gap-3 border-t border-white/[0.03] px-4 py-2">
                    <span className="mt-1.5 w-4 shrink-0 text-center text-[11px] tracking-wider text-white/25 uppercase">
                      CC
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      {ccList.map((email, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-sm text-white/80">
                          {email}
                          {!actionTaken && (
                            <button
                              onClick={() => removeChip(i, ccList, setCcList)}
                              className="text-white/30 transition-colors hover:text-white/70">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                      {!actionTaken && (
                        <input
                          type="text"
                          value={ccInput}
                          onChange={(e) => setCcInput(e.target.value)}
                          onKeyDown={(e) =>
                            handleChipKeyDown(e, ccInput, ccList, setCcList, setCcInput)
                          }
                          onBlur={() => {
                            if (ccInput.trim()) addChip(ccInput, ccList, setCcList, setCcInput);
                          }}
                          placeholder="Add CC..."
                          className="min-w-[100px] flex-1 bg-transparent py-1 text-sm text-white/80 outline-none placeholder:text-white/25"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 border-t border-white/[0.03] px-4 py-2">
                    <span className="mt-1.5 w-4 shrink-0 text-center text-[11px] tracking-wider text-white/25 uppercase">
                      BCC
                    </span>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      {bccList.map((email, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-sm text-white/80">
                          {email}
                          {!actionTaken && (
                            <button
                              onClick={() => removeChip(i, bccList, setBccList)}
                              className="text-white/30 transition-colors hover:text-white/70">
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))}
                      {!actionTaken && (
                        <input
                          type="text"
                          value={bccInput}
                          onChange={(e) => setBccInput(e.target.value)}
                          onKeyDown={(e) =>
                            handleChipKeyDown(e, bccInput, bccList, setBccList, setBccInput)
                          }
                          onBlur={() => {
                            if (bccInput.trim())
                              addChip(bccInput, bccList, setBccList, setBccInput);
                          }}
                          placeholder="Add BCC..."
                          className="min-w-[100px] flex-1 bg-transparent py-1 text-sm text-white/80 outline-none placeholder:text-white/25"
                        />
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Subject */}
              <div className="flex items-center gap-3 border-t border-white/[0.03] px-4 py-2.5">
                <AtSign className="h-4 w-4 shrink-0 text-white/30" />
                {actionTaken ? (
                  <span className="text-sm text-white/70">{subject}</span>
                ) : (
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                    className="flex-1 bg-transparent py-0.5 text-sm font-medium text-zinc-200 placeholder-zinc-500 outline-none focus:outline-none"
                  />
                )}
              </div>
            </div>

            {/* ── Body ── */}
            <div className="px-5 py-4 text-zinc-300">
              {actionTaken ? (
                <div className="scrollbar-thin scrollbar-thumb-[#2a2a2a] scrollbar-track-transparent scrollbar-thumb-rounded-full max-h-[360px] overflow-y-auto">
                  <MarkdownRenderer content={body} />
                </div>
              ) : (
                <MarkdownEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Write your email..."
                  maxHeight={280}
                  className="scrollbar-thin scrollbar-thumb-[#2a2a2a] scrollbar-track-transparent scrollbar-thumb-rounded-full"
                />
              )}
            </div>

            {/* ── Footer ── */}
            {!actionTaken && (
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                {/* Formatting Toolbar */}
                <div className="flex items-center gap-2 px-1">
                  <button className="bubble flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-zinc-100 backdrop-blur-md transition-all hover:scale-110 hover:brightness-110">
                    <Paperclip className="h-4 w-4 drop-shadow-md" />
                  </button>

                  <button className="bubble flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-zinc-100 backdrop-blur-md transition-all hover:scale-110 hover:brightness-110">
                    <Bold className="h-4 w-4 drop-shadow-md" />
                  </button>

                  <button className="bubble flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-zinc-100 backdrop-blur-md transition-all hover:scale-110 hover:brightness-110">
                    <Italic className="h-4 w-4 drop-shadow-md" />
                  </button>

                  <button className="bubble flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-zinc-100 backdrop-blur-md transition-all hover:scale-110 hover:brightness-110">
                    <Strikethrough className="h-4 w-4 drop-shadow-md" />
                  </button>

                  <button className="bubble flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-zinc-100 backdrop-blur-md transition-all hover:scale-110 hover:brightness-110">
                    <ListOrdered className="h-4 w-4 drop-shadow-md" />
                  </button>

                  <button className="bubble flex h-9 w-9 items-center justify-center rounded-full bg-transparent text-zinc-100 backdrop-blur-md transition-all hover:scale-110 hover:brightness-110">
                    <List className="h-4 w-4 drop-shadow-md" />
                  </button>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    className="bubble mr-1 flex h-10 w-10 items-center justify-center rounded-full bg-transparent text-zinc-100 backdrop-blur-md transition-all hover:scale-110"
                    tabIndex={-1}
                    title="Regenerate">
                    <RotateCcw className="h-4 w-4 drop-shadow-md" />
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isSending}
                    className="bubble rounded-full bg-red-500/80 px-6 py-2.5 text-sm font-bold text-red-100 backdrop-blur-md transition-all hover:scale-105 focus:ring-2 focus:ring-red-500/50 focus:outline-none disabled:opacity-50">
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={isSending}
                    className="bubble flex items-center gap-2.5 rounded-full bg-violet-500/80 py-2.5 pr-3 pl-6 text-sm font-bold text-violet-100 backdrop-blur-md transition-all hover:scale-105 focus:ring-2 focus:ring-violet-500/50 focus:outline-none disabled:opacity-50">
                    {isSending ? (
                      "Sending..."
                    ) : (
                      <>
                        Send Email
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
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
