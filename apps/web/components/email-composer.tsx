"use client";

import { useCallback, useEffect, useState } from "react";

import Image from "next/image";

import { AtSign, Check, ChevronDown, ChevronUp, RotateCcw, Users, X } from "lucide-react";

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
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/10">
            <Image
              src="/integrations/gmail.svg"
              alt="Gmail"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">Write E-Mail</span>
          {actionTaken && (
            <div
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full",
                actionTaken === "sent" ? "bg-emerald-500/20" : "bg-white/10"
              )}>
              {actionTaken === "sent" ? (
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
          {/* ── Recipients ── */}
          <div className="border-b border-white/5">
            {/* To */}
            <div className="flex items-start gap-3 px-4 py-2.5">
              <Users className="mt-1.5 h-4 w-4 shrink-0 text-white/30" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                {toList.map((email, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.06] px-2.5 py-1 text-sm text-white/80">
                    {email}
                    {!actionTaken && (
                      <button
                        onClick={() => removeChip(i, toList, setToList)}
                        className="text-white/30 transition-colors hover:text-white/70">
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
                    onKeyDown={(e) => handleChipKeyDown(e, toInput, toList, setToList, setToInput)}
                    onBlur={() => {
                      if (toInput.trim()) addChip(toInput, toList, setToList, setToInput);
                    }}
                    placeholder={toList.length === 0 ? "Add recipient..." : ""}
                    className="min-w-[120px] flex-1 bg-transparent py-1 text-sm text-white/80 outline-none placeholder:text-white/25"
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
                          if (bccInput.trim()) addChip(bccInput, bccList, setBccList, setBccInput);
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
                  className="flex-1 bg-transparent py-0.5 text-sm text-white/80 outline-none placeholder:text-white/25"
                />
              )}
            </div>
          </div>

          {/* ── Body ── */}
          <div className="scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent max-h-[360px] overflow-y-auto px-5 py-4">
            {actionTaken ? (
              <MarkdownRenderer content={body} />
            ) : (
              <MarkdownEditor
                value={body}
                onChange={setBody}
                placeholder="Write your email..."
                maxHeight={280}
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
                disabled={isSending}
                className="h-9 border-red-500/30 bg-red-500/20 px-4 text-red-300 hover:bg-red-500/30 hover:text-red-200">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={isSending}
                className="h-9 gap-2 bg-purple-600 px-4 text-white hover:bg-purple-700">
                {isSending ? (
                  "Sending..."
                ) : (
                  <>
                    Send Email
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
