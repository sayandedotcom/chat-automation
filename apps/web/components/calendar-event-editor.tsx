"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Check,
  Plus,
  Video,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import Image from "next/image";
import type { ToolCallPreview } from "./workflow-timeline";

/* ═══════════════════════════════════════════════════════════
   Types & helpers
   ═══════════════════════════════════════════════════════════ */

interface CalendarEventEditorProps {
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

function parseAttendees(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object" && "email" in v) return String((v as { email: string }).email);
        return "";
      })
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function parseDateTimeArg(dtObj: unknown): Date {
  if (!dtObj) return new Date();
  if (typeof dtObj === "string") return new Date(dtObj);
  if (typeof dtObj === "object" && dtObj !== null && "dateTime" in dtObj) {
    return new Date(String((dtObj as { dateTime: string }).dateTime));
  }
  return new Date();
}

function formatDatePill(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTimePill(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateInput(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function setTime(d: Date, hours: number, minutes: number): Date {
  const n = new Date(d);
  n.setHours(hours, minutes, 0, 0);
  return n;
}

function setDateKeepTime(base: Date, newDate: Date): Date {
  const n = new Date(newDate);
  n.setHours(base.getHours(), base.getMinutes(), 0, 0);
  return n;
}

/** Generate 15-min interval time slots */
function generateTimeSlots(): { label: string; hours: number; minutes: number }[] {
  const slots: { label: string; hours: number; minutes: number }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const d = new Date(2000, 0, 1, h, m);
      slots.push({
        label: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
        hours: h,
        minutes: m,
      });
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

/* ═══════════════════════════════════════════════════════════
   Sub-components: Calendar Picker & Time Dropdown
   ═══════════════════════════════════════════════════════════ */

function CalendarPicker({
  selected,
  onApply,
  onCancel,
}: {
  selected: Date;
  onApply: (d: Date) => void;
  onCancel: () => void;
}) {
  const [viewing, setViewing] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const [picked, setPicked] = useState(selected);
  const today = useMemo(() => new Date(), []);

  const year = viewing.getFullYear();
  const month = viewing.getMonth();
  const monthName = viewing.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => setViewing(new Date(year, month - 1, 1));
  const nextMonth = () => setViewing(new Date(year, month + 1, 1));
  const goToday = () => {
    setPicked(today);
    setViewing(new Date(today.getFullYear(), today.getMonth(), 1));
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="w-[296px] bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl shadow-black/50 p-4 select-none">
      {/* Header nav */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 rounded-md hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-4 h-4 text-white/60" />
        </button>
        <span className="text-sm font-medium text-white/90">{monthName}</span>
        <button onClick={nextMonth} className="p-1 rounded-md hover:bg-white/10 transition-colors">
          <ChevronRight className="w-4 h-4 text-white/60" />
        </button>
      </div>

      {/* Date input + Today */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-sm text-white/70">
          {formatDateInput(picked)}
        </div>
        <button
          onClick={goToday}
          className="px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-sm text-white/70 hover:bg-white/10 transition-colors"
        >
          Today
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-[11px] text-white/30 py-1 font-medium">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const cellDate = new Date(year, month, day);
          const isSelected = sameDay(cellDate, picked);
          const isToday = sameDay(cellDate, today);

          return (
            <button
              key={day}
              onClick={() => setPicked(cellDate)}
              className={cn(
                "relative w-9 h-9 mx-auto rounded-full flex items-center justify-center text-sm transition-all",
                isSelected
                  ? "bg-purple-600 text-white font-medium"
                  : "text-white/70 hover:bg-white/10",
              )}
            >
              {day}
              {isToday && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-purple-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-white/[0.06]">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="h-8 px-4 text-xs bg-transparent border-white/10 text-white/60 hover:bg-white/5"
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => onApply(picked)}
          className="h-8 px-4 text-xs bg-purple-600 hover:bg-purple-700 text-white gap-1.5"
        >
          Apply
          <span className="flex items-center gap-0.5 text-[10px] text-white/50">
            <span>⌘</span><span>↵</span>
          </span>
        </Button>
      </div>
    </div>
  );
}

function TimeDropdown({
  selected,
  onSelect,
  onClose,
}: {
  selected: Date;
  onSelect: (hours: number, minutes: number) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");
  const selectedH = selected.getHours();
  const selectedM = selected.getMinutes();

  const filtered = filter.trim()
    ? TIME_SLOTS.filter((s) => s.label.toLowerCase().includes(filter.toLowerCase()))
    : TIME_SLOTS;

  // Scroll to current selection on mount
  useEffect(() => {
    if (!listRef.current) return;
    const idx = TIME_SLOTS.findIndex((s) => s.hours === selectedH && s.minutes === selectedM);
    if (idx >= 0) {
      const el = listRef.current.children[idx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "center" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="w-[220px] bg-[#1e1e1e] border border-white/10 rounded-xl shadow-2xl shadow-black/50 overflow-hidden select-none">
      {/* Search input */}
      <div className="p-2 border-b border-white/[0.06]">
        <input
          autoFocus
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Enter expression: 2pm, in 10 min"
          className="w-full px-3 py-1.5 rounded-lg bg-white/[0.06] border border-white/[0.08] text-sm text-white/80 placeholder:text-white/25 outline-none"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
        />
      </div>

      {/* Time list */}
      <div ref={listRef} className="max-h-[240px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent py-1">
        {filtered.map((slot) => {
          const isActive = slot.hours === selectedH && slot.minutes === selectedM;
          return (
            <button
              key={`${slot.hours}-${slot.minutes}`}
              onClick={() => {
                onSelect(slot.hours, slot.minutes);
                onClose();
              }}
              className={cn(
                "w-full px-4 py-2 text-left text-sm transition-colors",
                isActive
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/60 hover:bg-white/[0.06] hover:text-white/80",
              )}
            >
              {slot.label}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="px-4 py-3 text-sm text-white/30 text-center">No matching times</div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════ */

export function CalendarEventEditor({
  toolCall,
  stepNumber,
  onApprove,
  completed = false,
  className,
}: CalendarEventEditorProps) {
  const args = toolCall.arguments;

  // Parse initial values from tool call args
  const [title, setTitle] = useState(() => String(args.summary ?? args.title ?? ""));
  const [attendees, setAttendees] = useState<string[]>(() => parseAttendees(args.attendees));
  const [attendeeInput, setAttendeeInput] = useState("");
  const [startDt, setStartDt] = useState(() => parseDateTimeArg(args.start));
  const [endDt, setEndDt] = useState(() => parseDateTimeArg(args.end));
  const [description, setDescription] = useState(() => String(args.description ?? ""));
  const [createMeet, setCreateMeet] = useState(() => {
    const conf = args.conferenceData;
    return conf !== undefined && conf !== null;
  });

  const [isCreating, setIsCreating] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [actionTaken, setActionTaken] = useState<"created" | "skipped" | null>(
    completed ? "created" : null,
  );

  // Popup state
  const [openPopup, setOpenPopup] = useState<
    null | "startDate" | "endDate" | "startTime" | "endTime"
  >(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Close popups on outside click
  useEffect(() => {
    if (!openPopup) return;
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpenPopup(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [openPopup]);

  useEffect(() => {
    if (completed && !actionTaken) {
      setActionTaken("created");
      setIsCollapsed(true);
    }
  }, [completed, actionTaken]);

  // Auto-resize description
  useEffect(() => {
    const el = descRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [description]);

  const isDirty = useCallback(() => {
    const origTitle = String(args.summary ?? args.title ?? "");
    const origAttendees = parseAttendees(args.attendees);
    const origStart = parseDateTimeArg(args.start);
    const origEnd = parseDateTimeArg(args.end);
    const origDesc = String(args.description ?? "");
    if (title !== origTitle) return true;
    if (attendees.join(",") !== origAttendees.join(",")) return true;
    if (startDt.getTime() !== origStart.getTime()) return true;
    if (endDt.getTime() !== origEnd.getTime()) return true;
    if (description !== origDesc) return true;
    return false;
  }, [title, attendees, startDt, endDt, description, args]);

  const handleCreate = useCallback(() => {
    if (isCreating || actionTaken) return;
    setIsCreating(true);
    setActionTaken("created");
    setIsCollapsed(true);

    if (isDirty()) {
      const editedArgs: Record<string, unknown> = {
        summary: title,
        attendees: attendees.map((e) => ({ email: e })),
        start: { dateTime: startDt.toISOString() },
        end: { dateTime: endDt.toISOString() },
        description,
      };
      if (createMeet) {
        editedArgs.conferenceData = { createRequest: { requestId: crypto.randomUUID() } };
      }
      onApprove(stepNumber, "edit", {
        tool_calls: [{ id: toolCall.id, arguments: editedArgs }],
      });
    } else {
      onApprove(stepNumber, "approve");
    }
  }, [title, attendees, startDt, endDt, description, createMeet, isDirty, isCreating, actionTaken, onApprove, stepNumber, toolCall.id]);

  const handleCancel = useCallback(() => {
    if (actionTaken) return;
    setActionTaken("skipped");
    setIsCollapsed(true);
    onApprove(stepNumber, "skip");
  }, [onApprove, stepNumber, actionTaken]);

  // Cmd+Enter
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

  // Chip helpers
  const addAttendee = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !attendees.includes(trimmed)) {
      setAttendees([...attendees, trimmed]);
    }
    setAttendeeInput("");
  };

  const removeAttendee = (index: number) => {
    setAttendees(attendees.filter((_, i) => i !== index));
  };

  const handleAttendeeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addAttendee(attendeeInput);
    }
    if (e.key === "Backspace" && attendeeInput === "" && attendees.length > 0) {
      removeAttendee(attendees.length - 1);
    }
  };

  const readonly = !!actionTaken;

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
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Image
              src="/integrations/google_calendar.svg"
              alt="Google Calendar"
              width={16}
              height={16}
              className="object-contain"
            />
          </div>
          <span className="text-sm font-medium text-white/90">Create Event</span>
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
        {actionTaken ? (
          <button className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors">
            {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
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
          <div className="px-5 py-4 space-y-5 max-h-[520px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            {/* ── Title ── */}
            <div>
              <label className="block text-xs text-white/35 mb-2 tracking-wide">Title</label>
              {readonly ? (
                <div className="px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/80">
                  {title}
                </div>
              ) : (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Event title"
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-white/15 transition-colors"
                />
              )}
            </div>

            {/* ── Attendees ── */}
            <div>
              <label className="block text-xs text-white/35 mb-2 tracking-wide">Attendees</label>
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] min-h-[40px]">
                {attendees.map((email, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/[0.06] border border-white/[0.08] text-sm text-white/80"
                  >
                    {email}
                    {!readonly && (
                      <button
                        onClick={() => removeAttendee(i)}
                        className="text-white/30 hover:text-white/70 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </span>
                ))}
                {!readonly && (
                  <>
                    <input
                      type="text"
                      value={attendeeInput}
                      onChange={(e) => setAttendeeInput(e.target.value)}
                      onKeyDown={handleAttendeeKeyDown}
                      onBlur={() => {
                        if (attendeeInput.trim()) addAttendee(attendeeInput);
                      }}
                      placeholder={attendees.length === 0 ? "Add attendee..." : ""}
                      className="bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none min-w-[100px] flex-1 py-0.5"
                    />
                    <button
                      onClick={() => {
                        if (attendeeInput.trim()) addAttendee(attendeeInput);
                      }}
                      className="p-1 rounded-md hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* ── Time ── */}
            <div>
              <label className="block text-xs text-white/35 mb-2 tracking-wide">Time</label>
              <div className="flex items-center gap-2 flex-wrap relative">
                {/* Start date pill */}
                <div className="relative">
                  <button
                    onClick={() => !readonly && setOpenPopup(openPopup === "startDate" ? null : "startDate")}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm transition-colors",
                      readonly
                        ? "bg-white/[0.04] border border-white/[0.06] text-white/70 cursor-default"
                        : "bg-white/[0.06] border border-white/[0.08] text-white/80 hover:bg-white/10 cursor-pointer",
                      openPopup === "startDate" && "border-purple-500/50 bg-white/10",
                    )}
                  >
                    {formatDatePill(startDt)}
                  </button>
                  {openPopup === "startDate" && (
                    <div ref={popupRef} className="absolute top-full left-0 mt-2 z-50">
                      <CalendarPicker
                        selected={startDt}
                        onApply={(d) => {
                          setStartDt(setDateKeepTime(startDt, d));
                          // If end is before start, shift end too
                          if (setDateKeepTime(endDt, d) < setDateKeepTime(startDt, d)) {
                            setEndDt(setDateKeepTime(endDt, d));
                          }
                          setOpenPopup(null);
                        }}
                        onCancel={() => setOpenPopup(null)}
                      />
                    </div>
                  )}
                </div>

                {/* Start time pill */}
                <div className="relative">
                  <button
                    onClick={() => !readonly && setOpenPopup(openPopup === "startTime" ? null : "startTime")}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm transition-colors",
                      readonly
                        ? "bg-white/[0.04] border border-white/[0.06] text-white/70 cursor-default"
                        : "bg-white/[0.06] border border-white/[0.08] text-white/80 hover:bg-white/10 cursor-pointer",
                      openPopup === "startTime" && "border-purple-500/50 bg-white/10",
                    )}
                  >
                    {formatTimePill(startDt)}
                  </button>
                  {openPopup === "startTime" && (
                    <div ref={popupRef} className="absolute top-full left-0 mt-2 z-50">
                      <TimeDropdown
                        selected={startDt}
                        onSelect={(h, m) => {
                          setStartDt(setTime(startDt, h, m));
                        }}
                        onClose={() => setOpenPopup(null)}
                      />
                    </div>
                  )}
                </div>

                <span className="text-white/20 text-sm px-0.5">—</span>

                {/* End time pill */}
                <div className="relative">
                  <button
                    onClick={() => !readonly && setOpenPopup(openPopup === "endTime" ? null : "endTime")}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm transition-colors",
                      readonly
                        ? "bg-white/[0.04] border border-white/[0.06] text-white/70 cursor-default"
                        : "bg-white/[0.06] border border-white/[0.08] text-white/80 hover:bg-white/10 cursor-pointer",
                      openPopup === "endTime" && "border-purple-500/50 bg-white/10",
                    )}
                  >
                    {formatTimePill(endDt)}
                  </button>
                  {openPopup === "endTime" && (
                    <div ref={popupRef} className="absolute top-full left-0 mt-2 z-50">
                      <TimeDropdown
                        selected={endDt}
                        onSelect={(h, m) => {
                          setEndDt(setTime(endDt, h, m));
                        }}
                        onClose={() => setOpenPopup(null)}
                      />
                    </div>
                  )}
                </div>

                {/* End date pill */}
                <div className="relative">
                  <button
                    onClick={() => !readonly && setOpenPopup(openPopup === "endDate" ? null : "endDate")}
                    className={cn(
                      "px-3 py-2 rounded-lg text-sm transition-colors",
                      readonly
                        ? "bg-white/[0.04] border border-white/[0.06] text-white/70 cursor-default"
                        : "bg-white/[0.06] border border-white/[0.08] text-white/80 hover:bg-white/10 cursor-pointer",
                      openPopup === "endDate" && "border-purple-500/50 bg-white/10",
                    )}
                  >
                    {formatDatePill(endDt)}
                  </button>
                  {openPopup === "endDate" && (
                    <div ref={popupRef} className="absolute top-full right-0 mt-2 z-50">
                      <CalendarPicker
                        selected={endDt}
                        onApply={(d) => {
                          setEndDt(setDateKeepTime(endDt, d));
                          setOpenPopup(null);
                        }}
                        onCancel={() => setOpenPopup(null)}
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Description ── */}
            <div>
              <label className="block text-xs text-white/35 mb-2 tracking-wide">Description</label>
              {readonly ? (
                <div className="px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/60 whitespace-pre-wrap min-h-[60px]">
                  {description || "No description"}
                </div>
              ) : (
                <textarea
                  ref={descRef}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add a description"
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70 placeholder:text-white/25 outline-none resize-none focus:border-white/15 transition-colors"
                />
              )}
            </div>

            {/* ── Meeting Room / Google Meet toggle ── */}
            <div>
              <label className="block text-xs text-white/35 mb-2 tracking-wide">Meeting Room</label>
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded bg-blue-500/15 flex items-center justify-center">
                    <Video className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="text-sm text-white/80">Create Google Meet</span>
                </div>
                {/* Toggle switch */}
                <button
                  onClick={() => !readonly && setCreateMeet(!createMeet)}
                  className={cn(
                    "relative w-10 h-[22px] rounded-full transition-colors",
                    readonly ? "cursor-default" : "cursor-pointer",
                    createMeet ? "bg-purple-600" : "bg-white/10",
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                      createMeet ? "translate-x-[22px]" : "translate-x-[3px]",
                    )}
                  />
                </button>
              </div>
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
                onClick={handleCreate}
                disabled={isCreating}
                className="px-4 h-9 bg-purple-600 hover:bg-purple-700 text-white gap-2"
              >
                {isCreating ? (
                  "Creating..."
                ) : (
                  <>
                    Create Event
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
