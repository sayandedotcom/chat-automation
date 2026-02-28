"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Users,
  AtSign,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Link2,
  Check,
  Pencil,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import Image from "next/image";
import { MarkdownRenderer } from "./markdown-renderer";
import type { ToolCallPreview } from "./workflow-timeline";

interface EmailComposerProps {
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

  const [toList, setToList] = useState<string[]>(() =>
    parseRecipients(args.to),
  );
  const [ccList, setCcList] = useState<string[]>(() =>
    parseRecipients(args.cc),
  );
  const [bccList, setBccList] = useState<string[]>(() =>
    parseRecipients(args.bcc),
  );
  const [subject, setSubject] = useState(() => String(args.subject ?? ""));
  const [body, setBody] = useState(() => String(args.body ?? ""));

  const [showCcBcc, setShowCcBcc] = useState(
    () => ccList.length > 0 || bccList.length > 0,
  );
  const [toInput, setToInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [isEditing, setIsEditing] = useState(false);
  const [actionTaken, setActionTaken] = useState<"sent" | "skipped" | null>(
    completed ? "sent" : null,
  );

  const bodyRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    const el = bodyRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 320) + "px";
    }
  }, [body, isEditing]);

  const handleSend = useCallback(() => {
    if (isSending || actionTaken) return;
    setIsSending(true);
    setActionTaken("sent");
    setIsCollapsed(true);
    setIsEditing(false);

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
    toList, ccList, bccList, subject, body,
    isDirty, isSending, actionTaken, onApprove, stepNumber, toolCall.id,
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
    setInput: (v: string) => void,
  ) => {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
    }
    setInput("");
  };

  const removeChip = (
    index: number,
    list: string[],
    setList: (v: string[]) => void,
  ) => {
    setList(list.filter((_, i) => i !== index));
  };

  const handleChipKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    inputValue: string,
    list: string[],
    setList: (v: string[]) => void,
    setInput: (v: string) => void,
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
          <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Image
              src="/integrations/gmail.svg"
              alt="Gmail"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">
            Write E-Mail
          </span>
          {actionTaken && (
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center",
              actionTaken === "sent"
                ? "bg-emerald-500/20"
                : "bg-white/10",
            )}>
              {actionTaken === "sent" ? (
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
          {/* ── Recipients ── */}
          <div className="border-b border-white/5">
            {/* To */}
            <div className="px-4 py-2.5 flex items-start gap-3">
              <Users className="w-4 h-4 text-white/30 mt-1.5 shrink-0" />
              <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                {toList.map((email, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-sm text-white/80"
                  >
                    {email}
                    {!actionTaken && (
                      <button
                        onClick={() => removeChip(i, toList, setToList)}
                        className="text-white/30 hover:text-white/70 transition-colors"
                      >
                        <X className="w-3 h-3" />
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
                    className="bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none min-w-[120px] flex-1 py-1"
                  />
                )}
                {!actionTaken && !showCcBcc && (
                  <button
                    onClick={() => setShowCcBcc(true)}
                    className="text-[11px] text-white/30 hover:text-white/50 transition-colors ml-auto shrink-0 tracking-wide uppercase"
                  >
                    CC / BCC
                  </button>
                )}
              </div>
            </div>

            {/* CC / BCC */}
            {showCcBcc && (
              <>
                <div className="px-4 py-2 flex items-start gap-3 border-t border-white/[0.03]">
                  <span className="text-[11px] text-white/25 mt-1.5 w-4 text-center shrink-0 uppercase tracking-wider">
                    CC
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    {ccList.map((email, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-sm text-white/80"
                      >
                        {email}
                        {!actionTaken && (
                          <button
                            onClick={() => removeChip(i, ccList, setCcList)}
                            className="text-white/30 hover:text-white/70 transition-colors"
                          >
                            <X className="w-3 h-3" />
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
                        className="bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none min-w-[100px] flex-1 py-1"
                      />
                    )}
                  </div>
                </div>
                <div className="px-4 py-2 flex items-start gap-3 border-t border-white/[0.03]">
                  <span className="text-[11px] text-white/25 mt-1.5 w-4 text-center shrink-0 uppercase tracking-wider">
                    BCC
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                    {bccList.map((email, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-sm text-white/80"
                      >
                        {email}
                        {!actionTaken && (
                          <button
                            onClick={() => removeChip(i, bccList, setBccList)}
                            className="text-white/30 hover:text-white/70 transition-colors"
                          >
                            <X className="w-3 h-3" />
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
                        className="bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none min-w-[100px] flex-1 py-1"
                      />
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Subject */}
            <div className="px-4 py-2.5 flex items-center gap-3 border-t border-white/[0.03]">
              <AtSign className="w-4 h-4 text-white/30 shrink-0" />
              {actionTaken ? (
                <span className="text-sm text-white/70">{subject}</span>
              ) : (
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none flex-1 py-0.5"
                />
              )}
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-5 py-4 max-h-[360px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {actionTaken || !isEditing ? (
              <MarkdownRenderer content={body} />
            ) : (
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your email..."
                rows={4}
                className={cn(
                  "w-full bg-transparent text-sm text-white/70 placeholder:text-white/25",
                  "outline-none resize-none leading-relaxed",
                  "max-h-[320px] overflow-y-auto",
                )}
              />
            )}
          </div>

          {/* ── Footer: Toolbar + Actions ── */}
          {!actionTaken && (
            <div className="px-4 py-2.5 flex items-center justify-between border-t border-white/5 bg-[#151515]">
              <div className="flex items-center gap-0.5">
                <button
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    isEditing
                      ? "bg-white/10 text-white/70"
                      : "text-white/25 hover:text-white/45 hover:bg-white/[0.04]",
                  )}
                  tabIndex={-1}
                  title={isEditing ? "Preview" : "Edit body"}
                  onClick={() => setIsEditing(!isEditing)}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                {[Link2, Bold, Italic, Strikethrough, ListOrdered, List].map(
                  (Icon, i) => (
                    <button
                      key={i}
                      className="p-1.5 rounded-md text-white/25 hover:text-white/45 hover:bg-white/[0.04] transition-colors"
                      tabIndex={-1}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ),
                )}
              </div>
              <div className="flex items-center gap-2">
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
                  disabled={isSending}
                  className="px-4 h-9 bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-red-200"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={isSending}
                  className="px-4 h-9 bg-purple-600 hover:bg-purple-700 text-white gap-2"
                >
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
