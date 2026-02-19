"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Check, X } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import Image from "next/image";
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
    content?: Record<string, unknown>,
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
  const createCall = toolCalls.find(
    (tc) => tc.tool_name === "create_spreadsheet",
  );
  if (!createCall) return [];

  const args = createCall.arguments;
  let sheets = sheetsFromCreateArgs(args);

  // If create_spreadsheet has no column info, try to harvest from a
  // co-located modify_sheet_values / write_values / batch_update call
  if (sheets.length === 0 || sheets.every((s) => s.columns.length === 0)) {
    const modifyCall = toolCalls.find((tc) =>
      ["modify_sheet_values", "write_values", "batch_update", "update_values"].includes(
        tc.tool_name,
      ),
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
            i === 0 ? { ...s, name: sheetName || s.name, columns: cols } : s,
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
  const createCall = toolCalls.find(
    (tc) => tc.tool_name === "create_spreadsheet",
  );
  const args = createCall?.arguments ?? {};

  const rawTitle = String(
    args.title ?? args.spreadsheet_title ?? args.name ?? "Untitled Spreadsheet",
  );

  const sheets = deriveSheets(toolCalls);
  const totalColumns = sheets.reduce((sum, s) => sum + s.columns.length, 0);

  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [isCreating, setIsCreating] = useState(false);
  const [actionTaken, setActionTaken] = useState<"created" | "skipped" | null>(
    completed ? "created" : null,
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
        onClick={actionTaken ? () => setIsCollapsed((v) => !v) : undefined}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <Image
              src="/integrations/google_sheets.svg"
              alt="Google Sheets"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">
            Spreadsheet Structure
          </span>
          {actionTaken && (
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center",
                actionTaken === "created" ? "bg-emerald-500/20" : "bg-white/10",
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

        {/* Right controls */}
        <div className="flex items-center gap-1">
          {!actionTaken && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCancel();
              }}
              className="p-1 rounded-md hover:bg-white/5 transition-colors"
              title="Cancel"
            >
              <X className="w-3.5 h-3.5 text-white/40 hover:text-white/60" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed((v) => !v);
            }}
            className="p-1 rounded-md hover:bg-white/5 transition-colors"
          >
            {isCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5 text-white/40" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5 text-white/40" />
            )}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {!isCollapsed && (
        <>
          <div className="px-4 pt-4 pb-3 max-h-[420px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent space-y-4">
            {/* Spreadsheet title + counts */}
            <div>
              <h3 className="text-[18px] font-semibold text-white leading-snug">
                {rawTitle}
              </h3>
              <p className="text-sm text-white/40 mt-0.5">
                {sheets.length === 1 ? "1 sheet" : `${sheets.length} sheets`}
                {totalColumns > 0 && (
                  <>
                    {" · "}
                    {totalColumns}{" "}
                    {totalColumns === 1 ? "column" : "columns"}
                  </>
                )}
              </p>
            </div>

            {/* Sheet list */}
            <div className="space-y-4">
              {sheets.map((sheet, idx) => (
                <div key={idx}>
                  {/* Sheet header */}
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-500/80 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-white/90">
                      {sheet.name}
                    </span>
                  </div>

                  {/* Column pills */}
                  <div className="flex flex-wrap gap-1.5">
                    {sheet.columns.length > 0 ? (
                      sheet.columns.map((col, cIdx) => (
                        <div
                          key={cIdx}
                          className="flex items-baseline gap-1 px-2.5 py-1 rounded-lg bg-white/[0.06] border border-white/[0.07]"
                        >
                          <span className="text-xs font-medium text-white/85">
                            {col.name}
                          </span>
                          <span className="text-[11px] text-white/35">
                            ({col.type})
                          </span>
                        </div>
                      ))
                    ) : (
                      <span className="text-xs text-white/30 italic">
                        No columns defined
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
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
                onClick={handleApprove}
                disabled={isCreating}
                className="px-4 h-9 bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {isCreating ? (
                  "Creating..."
                ) : (
                  <>
                    Approve &amp; Generate
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
