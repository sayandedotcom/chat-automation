"use client";

import { useCallback, useEffect, useState } from "react";

import Image from "next/image";

import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronUp, RotateCcw, X } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";

import type { ToolCallPreview } from "./workflow-timeline";

interface SheetColumn {
  name: string;
  type: string;
}

interface SheetDef {
  name: string;
  columns: SheetColumn[];
}

interface SheetsEditorProps {
  toolCalls: ToolCallPreview[];
  stepNumber: number;
  onApprove: (
    stepNumber: number,
    action: "approve" | "edit" | "skip",
    content?: Record<string, unknown>
  ) => void;
  completed?: boolean;
  className?: string;
}

// ---------- argument parsing helpers ----------

function toColumnObj(col: unknown): SheetColumn {
  if (typeof col === "string") return { name: col, type: "text" };
  if (col && typeof col === "object") {
    const c = col as Record<string, unknown>;
    return {
      name: String(c.name ?? c.header ?? c.title ?? col),
      type: String(c.type ?? c.dataType ?? "text"),
    };
  }
  return { name: String(col), type: "text" };
}

/**
 * Derive sheet definitions from a create_spreadsheet tool call.
 * Handles multiple argument shapes the LLM might emit:
 *   - { sheets: [{ title|name, headers|columns }] }
 *   - { headers: [...] }  (flat, single-sheet)
 */
function sheetsFromCreateArgs(args: Record<string, unknown>): SheetDef[] {
  const rawSheets = args.sheets ?? args.worksheets ?? args.tabs;
  if (Array.isArray(rawSheets) && rawSheets.length > 0) {
    return (rawSheets as Record<string, unknown>[]).map((s) => {
      const cols = (s.columns ?? s.headers ?? s.fields ?? []) as unknown[];
      return {
        name: String(s.name ?? s.title ?? "Sheet1"),
        columns: Array.isArray(cols) ? cols.map(toColumnObj) : [],
      };
    });
  }

  // Flat headers on the create call
  const flat = args.headers ?? args.columns ?? args.fields;
  if (Array.isArray(flat) && flat.length > 0) {
    return [{ name: "Sheet1", columns: flat.map(toColumnObj) }];
  }

  return [];
}

/**
 * Extract column names from a modify_sheet_values / batch_update call.
 * The first row of `values` is treated as the header row.
 */
function sheetsFromModifyArgs(args: Record<string, unknown>): SheetColumn[] {
  // values: [["Col1","Col2",...], ["row1c1","row1c2",...], ...]
  const values = args.values ?? args.data;
  if (Array.isArray(values) && Array.isArray(values[0])) {
    return (values[0] as unknown[]).map((h) => toColumnObj(h));
  }
  // headers directly on the call
  const flat = args.headers ?? args.columns;
  if (Array.isArray(flat)) return flat.map(toColumnObj);
  return [];
}

function deriveSheets(toolCalls: ToolCallPreview[]): SheetDef[] {
  const createCall = toolCalls.find((tc) => tc.tool_name === "create_spreadsheet");
  if (!createCall) return [];

  const args = createCall.arguments;
  let sheets = sheetsFromCreateArgs(args);

  // If create_spreadsheet has no column info, try to harvest from a
  // co-located modify_sheet_values / write_values / batch_update call
  if (sheets.length === 0 || sheets.every((s) => s.columns.length === 0)) {
    const modifyCall = toolCalls.find((tc) =>
      ["modify_sheet_values", "write_values", "batch_update", "update_values"].includes(
        tc.tool_name
      )
    );
    if (modifyCall) {
      const cols = sheetsFromModifyArgs(modifyCall.arguments);
      if (cols.length > 0) {
        const sheetName =
          typeof modifyCall.arguments.sheet_name === "string"
            ? modifyCall.arguments.sheet_name
            : typeof modifyCall.arguments.sheet === "string"
              ? modifyCall.arguments.sheet
              : "Sheet1";
        if (sheets.length === 0) {
          sheets = [{ name: sheetName, columns: cols }];
        } else {
          // Backfill columns into the first (empty) sheet
          sheets = sheets.map((s, i) =>
            i === 0 ? { ...s, name: sheetName || s.name, columns: cols } : s
          );
        }
      }
    }
  }

  // Final fallback: at least one unnamed sheet placeholder
  if (sheets.length === 0) {
    sheets = [{ name: "Sheet1", columns: [] }];
  }

  return sheets;
}

// ---------- component ----------

export function SheetsEditor({
  toolCalls,
  stepNumber,
  onApprove,
  completed = false,
  className,
}: SheetsEditorProps) {
  const createCall = toolCalls.find((tc) => tc.tool_name === "create_spreadsheet");
  const args = createCall?.arguments ?? {};

  const rawTitle = String(
    args.title ?? args.spreadsheet_title ?? args.name ?? "Untitled Spreadsheet"
  );

  const sheets = deriveSheets(toolCalls);
  const totalColumns = sheets.reduce((sum, s) => sum + s.columns.length, 0);

  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [isCreating, setIsCreating] = useState(false);
  const [actionTaken, setActionTaken] = useState<"created" | "skipped" | null>(
    completed ? "created" : null
  );

  useEffect(() => {
    if (completed && !actionTaken) {
      setActionTaken("created");
      setIsCollapsed(true);
    }
  }, [completed, actionTaken]);

  const handleApprove = useCallback(() => {
    if (isCreating || actionTaken) return;
    setIsCreating(true);
    setActionTaken("created");
    setIsCollapsed(true);
    onApprove(stepNumber, "approve");
  }, [isCreating, actionTaken, onApprove, stepNumber]);

  const handleCancel = useCallback(() => {
    if (actionTaken) return;
    setActionTaken("skipped");
    setIsCollapsed(true);
    onApprove(stepNumber, "skip");
  }, [actionTaken, onApprove, stepNumber]);

  useEffect(() => {
    if (actionTaken) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleApprove();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleApprove, actionTaken]);

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
        onClick={actionTaken ? () => setIsCollapsed((v) => !v) : undefined}>
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
            <Image
              src="/integrations/google_sheets.svg"
              alt="Google Sheets"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">Spreadsheet Structure</span>
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

        {/* Right controls */}
        <div className="flex items-center gap-1">
          {!actionTaken && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
              className="rounded-md p-1 transition-colors hover:bg-white/5"
              title="Cancel">
              <X className="h-3.5 w-3.5 text-white/40 hover:text-white/60" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed((v) => !v);
            }}
            className="rounded-md p-1 transition-colors hover:bg-white/5">
            {isCollapsed ? (
              <ChevronDown className="h-3.5 w-3.5 text-white/40" />
            ) : (
              <ChevronUp className="h-3.5 w-3.5 text-white/40" />
            )}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="collapsible"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden">
            <div className="scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent max-h-[420px] space-y-5 overflow-y-auto px-5 pt-5 pb-3">
              {/* Spreadsheet title + counts */}
              <div>
                <h3 className="text-lg leading-snug font-semibold text-white">{rawTitle}</h3>
                <p className="mt-0.5 text-sm text-white/40">
                  {sheets.length === 1 ? "1 sheet" : `${sheets.length} sheets`}
                  {totalColumns > 0 && (
                    <>
                      {" · "}
                      {totalColumns} {totalColumns === 1 ? "column" : "columns"}
                    </>
                  )}
                </p>
              </div>

              {/* Sheet list */}
              <div className="space-y-4">
                {sheets.map((sheet, idx) => (
                  <div key={idx}>
                    {/* Sheet header */}
                    <div className="mb-2.5 flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/80 text-[11px] font-semibold text-white">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-white/90">{sheet.name}</span>
                    </div>

                    {/* Column pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {sheet.columns.length > 0 ? (
                        sheet.columns.map((col, cIdx) => (
                          <div
                            key={cIdx}
                            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-800/40 px-3 py-1 text-sm text-zinc-200 shadow-sm">
                            <span className="text-xs font-medium text-white/85">{col.name}</span>
                            <span className="text-[11px] text-white/35">({col.type})</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-white/30 italic">No columns defined</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
                  onClick={handleApprove}
                  disabled={isCreating}
                  className="bubble flex items-center gap-2.5 rounded-full bg-violet-500/80 py-2.5 pr-3 pl-6 text-sm font-bold text-violet-100 backdrop-blur-md transition-all hover:scale-105 focus:ring-2 focus:ring-violet-500/50 focus:outline-none disabled:opacity-50">
                  {isCreating ? (
                    "Creating..."
                  ) : (
                    <>
                      Approve &amp; Generate
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
