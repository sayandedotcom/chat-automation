"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { z } from "zod";
import {
  X,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Check,
  Plus,
  Video,
  CalendarIcon,
} from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import { Calendar } from "@workspace/ui/components/calendar";
import Image from "next/image";
import type { ToolCallPreview } from "./workflow-timeline";

/* ═══════════════════════════════════════════════════════════
   Zod schema
   ═══════════════════════════════════════════════════════════ */

const eventSchema = z
  .object({
    summary: z.string().min(1, "Event title is required"),
    startDt: z.date(),
    endDt: z.date(),
    attendees: z.array(z.string()),
  })
  .refine((d) => d.endDt > d.startDt, {
    message: "End time must be after start time",
    path: ["endDt"],
  });

type FormErrors = { summary?: string; endDt?: string };

/* ═══════════════════════════════════════════════════════════
   Natural-language hint parser
   ═══════════════════════════════════════════════════════════ */

interface CalendarHint {
  date?: Date;
  startHour?: number;
  startMinute?: number;
  endHour?: number;
  endMinute?: number;
  isMeeting?: boolean;
}

export function parseCalendarHint(text: string): CalendarHint {
  if (!text) return {};
  const lower = text.toLowerCase();
  const result: CalendarHint = {};

  // ── Meeting detection ──────────────────────────────────
  if (
    /\b(meeting|sync|standup|stand.?up|video\s*call|team\s*call|catch.?up)\b/.test(
      lower,
    )
  ) {
    result.isMeeting = true;
  }

  // ── Month tables ───────────────────────────────────────
  const MONTH_FULL = [
    "january","february","march","april","may","june",
    "july","august","september","october","november","december",
  ];
  const MONTH_SHORT = [
    "jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec",
  ];
  function monthIdx(name: string) {
    const i = MONTH_FULL.indexOf(name);
    return i !== -1 ? i : MONTH_SHORT.indexOf(name);
  }

  // ── Date parsing ───────────────────────────────────────
  let parsedDay: number | undefined;
  let parsedMonth: number | undefined;

  // "24th february" / "24 feb" / "24 of feb"
  const dm = lower.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]+)\b/,
  );
  if (dm?.[1] && dm?.[2]) {
    const d = parseInt(dm[1]);
    const mi = monthIdx(dm[2]);
    if (mi !== -1 && d >= 1 && d <= 31) {
      parsedDay = d;
      parsedMonth = mi;
    }
  }

  // "february 24th" / "feb 24"
  if (parsedDay === undefined) {
    const md = lower.match(/\b([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
    if (md?.[1] && md?.[2]) {
      const mi = monthIdx(md[1]);
      const d = parseInt(md[2]);
      if (mi !== -1 && d >= 1 && d <= 31) {
        parsedDay = d;
        parsedMonth = mi;
      }
    }
  }

  // Relative dates
  if (parsedDay === undefined) {
    const WEEKDAYS = [
      "sunday","monday","tuesday","wednesday","thursday","friday","saturday",
    ];
    if (/\btomorrow\b/.test(lower)) {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      parsedDay = t.getDate();
      parsedMonth = t.getMonth();
    } else if (/\btoday\b/.test(lower)) {
      const t = new Date();
      parsedDay = t.getDate();
      parsedMonth = t.getMonth();
    } else {
      const nd = lower.match(
        /\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
      );
      if (nd?.[1]) {
        const target = WEEKDAYS.indexOf(nd[1]);
        const now = new Date();
        const diff = ((target - now.getDay() + 7) % 7) || 7;
        const d = new Date(now);
        d.setDate(now.getDate() + diff);
        parsedDay = d.getDate();
        parsedMonth = d.getMonth();
      }
    }
  }

  if (parsedDay !== undefined && parsedMonth !== undefined) {
    const now = new Date();
    const y = now.getFullYear();
    const candidate = new Date(y, parsedMonth, parsedDay);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    result.date =
      candidate < yesterday
        ? new Date(y + 1, parsedMonth, parsedDay)
        : candidate;
  }

  // ── Time range: "2:30 to 4:30 pm", "2-4pm", "10am-12pm" ──
  const rangeMatch = lower.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/,
  );
  if (rangeMatch?.[1] && rangeMatch?.[4]) {
    const [, sh, sm, sp, eh, em, ep] = rangeMatch;
    let sH = parseInt(sh),
      sM = parseInt(sm ?? "0");
    let eH = parseInt(eh),
      eM = parseInt(em ?? "0");

    if (ep === "pm" && eH !== 12) eH += 12;
    if (ep === "am" && eH === 12) eH = 0;

    if (sp === "pm" && sH !== 12) sH += 12;
    else if (sp === "am" && sH === 12) sH = 0;
    else if (!sp && ep === "pm" && sH < eH && sH !== 12) sH += 12; // infer PM

    result.startHour = sH;
    result.startMinute = sM;
    result.endHour = eH;
    result.endMinute = eM;
  }

  // ── Single time: "at 2:30 pm", "around 3pm" ───────────
  if (result.startHour === undefined) {
    const single = lower.match(
      /(?:at|around|@)?\s*\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/,
    );
    if (single?.[1] && single?.[3]) {
      let h = parseInt(single[1]);
      const m = parseInt(single[2] ?? "0");
      const p = single[3];
      if (p === "pm" && h !== 12) h += 12;
      if (p === "am" && h === 12) h = 0;
      result.startHour = h;
      result.startMinute = m;
    } else {
      // Vague keywords
      if (/\bmorning\b/.test(lower)) {
        result.startHour = 9;
        result.startMinute = 0;
      } else if (/\bnoon\b/.test(lower)) {
        result.startHour = 12;
        result.startMinute = 0;
      } else if (/\bafternoon\b/.test(lower)) {
        result.startHour = 14;
        result.startMinute = 0;
      } else if (/\bevening\b/.test(lower)) {
        result.startHour = 18;
        result.startMinute = 0;
      }
    }
  }

  return result;
}

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function parseAttendees(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (typeof v === "string") return v;
        if (v && typeof v === "object" && "email" in v)
          return String((v as { email: string }).email);
        return "";
      })
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseDateTimeArg(dtObj: unknown): Date {
  if (!dtObj) return new Date();
  if (typeof dtObj === "string") return new Date(dtObj);
  if (
    typeof dtObj === "object" &&
    dtObj !== null &&
    "dateTime" in dtObj
  ) {
    return new Date(String((dtObj as { dateTime: string }).dateTime));
  }
  return new Date();
}

function formatDatePill(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimePill(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function setTimeOnDate(d: Date, h: number, m: number): Date {
  const n = new Date(d);
  n.setHours(h, m, 0, 0);
  return n;
}

/** Round a Date to the nearest 15-minute slot */
function roundTo15(d: Date): Date {
  const n = new Date(d);
  const m = Math.round(n.getMinutes() / 15) * 15;
  if (m === 60) {
    n.setHours(n.getHours() + 1, 0, 0, 0);
  } else {
    n.setMinutes(m, 0, 0);
  }
  return n;
}

/** "HH:MM" value string from a Date (snapped to nearest 15 min) */
function toTimeValue(d: Date): string {
  const snapped = roundTo15(d);
  return `${snapped.getHours().toString().padStart(2, "0")}:${snapped.getMinutes().toString().padStart(2, "0")}`;
}

/** Parse "HH:MM" back to { h, m } */
function fromTimeValue(val: string): { h: number; m: number } {
  const parts = val.split(":").map(Number);
  return { h: parts[0] ?? 0, m: parts[1] ?? 0 };
}

/** Generate 15-min time slots */
type TimeSlot = { value: string; label: string };
function generateTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const d = new Date(2000, 0, 1, h, m);
      slots.push({
        value: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
        label: d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      });
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

/**
 * Compute initial start/end dates by merging tool-call args with
 * a parsed natural-language hint. The hint only applies when the
 * current args look like synthetic defaults (whole-hour, within 3h).
 */
function computeInitialDates(
  args: Record<string, unknown>,
  userHint?: string,
): { start: Date; end: Date } {
  let start = parseDateTimeArg(args.start);
  let end = parseDateTimeArg(args.end);

  if (!userHint) return { start, end };

  const hint = parseCalendarHint(userHint);

  // Detect synthetic defaults: whole hour, in the future, within 3h from now
  const now = new Date();
  const isSynthetic =
    start.getMinutes() === 0 &&
    start.getSeconds() === 0 &&
    start.getTime() > now.getTime() &&
    start.getTime() - now.getTime() < 3 * 3_600_000;

  if (!isSynthetic) return { start, end };

  // Apply parsed date
  if (hint.date) {
    const y = hint.date.getFullYear();
    const mo = hint.date.getMonth();
    const day = hint.date.getDate();
    start = new Date(y, mo, day, start.getHours(), start.getMinutes(), 0, 0);
    end = new Date(y, mo, day, end.getHours(), end.getMinutes(), 0, 0);
  }

  // Apply parsed start time
  if (hint.startHour !== undefined) {
    start = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      hint.startHour,
      hint.startMinute ?? 0,
      0,
      0,
    );
  }

  // Apply parsed end time
  if (hint.endHour !== undefined) {
    end = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
      hint.endHour,
      hint.endMinute ?? 0,
      0,
      0,
    );
  } else if (hint.startHour !== undefined) {
    // Default: end = start + 1 hour
    end = new Date(start.getTime() + 3_600_000);
  }

  return { start, end };
}

/* ═══════════════════════════════════════════════════════════
   Props
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
  /** Raw step description — parsed for NL date/time/meeting pre-fill */
  userHint?: string;
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
  userHint,
}: CalendarEventEditorProps) {
  const args = toolCall.arguments;

  // ── Initial values (hint-enhanced) ──────────────────────
  const { start: initStart, end: initEnd } = computeInitialDates(
    args,
    userHint,
  );

  const initMeet = (() => {
    if (args.conferenceData !== undefined && args.conferenceData !== null)
      return true;
    if (userHint) {
      const hint = parseCalendarHint(userHint);
      if (hint.isMeeting) return true;
    }
    return false;
  })();

  // ── State ────────────────────────────────────────────────
  const [title, setTitle] = useState(
    () => String(args.summary ?? args.title ?? ""),
  );
  const [attendees, setAttendees] = useState<string[]>(() =>
    parseAttendees(args.attendees),
  );
  const [attendeeInput, setAttendeeInput] = useState("");
  const [startDt, setStartDt] = useState(() => roundTo15(initStart));
  const [endDt, setEndDt] = useState(() => roundTo15(initEnd));
  const [description, setDescription] = useState(
    () => String(args.description ?? ""),
  );
  const [createMeet, setCreateMeet] = useState(initMeet);

  const [isCreating, setIsCreating] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(completed);
  const [actionTaken, setActionTaken] = useState<"created" | "skipped" | null>(
    completed ? "created" : null,
  );
  const [errors, setErrors] = useState<FormErrors>({});

  // Popover open states for date pickers
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);

  const descRef = useRef<HTMLTextAreaElement>(null);

  // ── Effects ──────────────────────────────────────────────

  useEffect(() => {
    if (completed && !actionTaken) {
      setActionTaken("created");
      setIsCollapsed(true);
    }
  }, [completed, actionTaken]);

  // Auto-resize description textarea
  useEffect(() => {
    const el = descRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [description]);

  // ── Dirty check ──────────────────────────────────────────
  const isDirty = useCallback(() => {
    const origTitle = String(args.summary ?? args.title ?? "");
    const origAttendees = parseAttendees(args.attendees);
    const origStart = roundTo15(parseDateTimeArg(args.start));
    const origEnd = roundTo15(parseDateTimeArg(args.end));
    const origDesc = String(args.description ?? "");
    if (title !== origTitle) return true;
    if (attendees.join(",") !== origAttendees.join(",")) return true;
    if (startDt.getTime() !== origStart.getTime()) return true;
    if (endDt.getTime() !== origEnd.getTime()) return true;
    if (description !== origDesc) return true;
    return false;
  }, [title, attendees, startDt, endDt, description, args]);

  // ── Actions ──────────────────────────────────────────────
  const handleCreate = useCallback(() => {
    if (isCreating || actionTaken) return;

    // Validate with Zod
    const validation = eventSchema.safeParse({
      summary: title,
      startDt,
      endDt,
      attendees,
    });

    if (!validation.success) {
      const errs: FormErrors = {};
      for (const e of validation.error.errors) {
        const key = String(e.path[0]);
        if (key === "summary") errs.summary = e.message;
        if (key === "endDt") errs.endDt = e.message;
      }
      setErrors(errs);
      return;
    }

    setErrors({});
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
        editedArgs.conferenceData = {
          createRequest: { requestId: crypto.randomUUID() },
        };
      }
      onApprove(stepNumber, "edit", {
        tool_calls: [{ id: toolCall.id, arguments: editedArgs }],
      });
    } else {
      onApprove(stepNumber, "approve");
    }
  }, [
    title,
    attendees,
    startDt,
    endDt,
    description,
    createMeet,
    isDirty,
    isCreating,
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

  // Cmd+Enter to submit
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

  // ── Attendee chip helpers ─────────────────────────────────
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

  const handleAttendeeKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      addAttendee(attendeeInput);
    }
    if (e.key === "Backspace" && attendeeInput === "" && attendees.length > 0) {
      removeAttendee(attendees.length - 1);
    }
  };

  const readonly = !!actionTaken;

  /* ── Render ─────────────────────────────────────────────── */
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
          actionTaken &&
            "cursor-pointer hover:bg-white/[0.02] transition-colors",
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
          <span className="text-sm font-medium text-white/90">
            Create Event
          </span>
          {actionTaken && (
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center",
                actionTaken === "created"
                  ? "bg-emerald-500/20"
                  : "bg-white/10",
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
        <button className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors">
          {actionTaken ? (
            isCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )
          ) : (
            <>
              <span>Permissions</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {/* ── Collapsible content ── */}
      {!isCollapsed && (
        <>
          <div className="px-5 py-4 space-y-5 max-h-[540px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">

            {/* ── Title ── */}
            <div>
              <label className="block text-xs text-white/35 mb-1.5 tracking-wide">
                Title
              </label>
              {readonly ? (
                <div className="px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/80">
                  {title}
                </div>
              ) : (
                <input
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (errors.summary) setErrors((p) => ({ ...p, summary: undefined }));
                  }}
                  placeholder="Event title"
                  className={cn(
                    "w-full px-3.5 py-2.5 rounded-lg bg-white/[0.04] border text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-white/15 transition-colors",
                    errors.summary ? "border-red-500/50" : "border-white/[0.06]",
                  )}
                />
              )}
              {errors.summary && (
                <p className="text-xs text-red-400 mt-1">{errors.summary}</p>
              )}
            </div>

            {/* ── Attendees ── */}
            <div>
              <label className="block text-xs text-white/35 mb-1.5 tracking-wide">
                Attendees
              </label>
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
                      placeholder={
                        attendees.length === 0 ? "Add attendee email..." : ""
                      }
                      className="bg-transparent text-sm text-white/80 placeholder:text-white/25 outline-none min-w-[120px] flex-1 py-0.5"
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

            {/* ── Date & Time ── */}
            <div>
              <label className="block text-xs text-white/35 mb-1.5 tracking-wide">
                Date & Time
              </label>

              {/* Row 1: Start date + Start time */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Start date picker */}
                {readonly ? (
                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70 flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-white/30" />
                    {formatDatePill(startDt)}
                  </div>
                ) : (
                  <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-1.5",
                          "bg-white/[0.06] border border-white/[0.08] text-white/80 hover:bg-white/10 cursor-pointer",
                          startDateOpen && "border-purple-500/50 bg-white/10",
                        )}
                      >
                        <CalendarIcon className="w-3.5 h-3.5 text-white/40" />
                        {formatDatePill(startDt)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 border-white/10 bg-[#1e1e1e]"
                      align="start"
                    >
                      <Calendar
                        mode="single"
                        selected={startDt}
                        onSelect={(d) => {
                          if (!d) return;
                          const updated = new Date(
                            d.getFullYear(),
                            d.getMonth(),
                            d.getDate(),
                            startDt.getHours(),
                            startDt.getMinutes(),
                            0,
                            0,
                          );
                          setStartDt(updated);
                          // Keep end on same day if it was
                          const newEnd = new Date(
                            d.getFullYear(),
                            d.getMonth(),
                            d.getDate(),
                            endDt.getHours(),
                            endDt.getMinutes(),
                            0,
                            0,
                          );
                          if (newEnd > updated) setEndDt(newEnd);
                          setStartDateOpen(false);
                        }}
                        initialFocus
                        className="[&_.rdp]:text-white/80"
                      />
                    </PopoverContent>
                  </Popover>
                )}

                {/* Start time select */}
                {readonly ? (
                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70">
                    {formatTimePill(startDt)}
                  </div>
                ) : (
                  <Select
                    value={toTimeValue(startDt)}
                    onValueChange={(val) => {
                      const { h, m } = fromTimeValue(val);
                      setStartDt(setTimeOnDate(startDt, h, m));
                      if (errors.endDt)
                        setErrors((p) => ({ ...p, endDt: undefined }));
                    }}
                  >
                    <SelectTrigger className="w-fit h-auto px-3 py-2 rounded-lg text-sm bg-white/[0.06] border border-white/[0.08] text-white/80 hover:bg-white/10 shadow-none focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[220px] bg-[#1e1e1e] border-white/10 text-white/80">
                      {TIME_SLOTS.map((s) => (
                        <SelectItem
                          key={s.value}
                          value={s.value}
                          className="focus:bg-white/10 focus:text-white/90 text-white/70"
                        >
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <span className="text-white/20 text-sm px-0.5">—</span>

                {/* End time select */}
                {readonly ? (
                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70">
                    {formatTimePill(endDt)}
                  </div>
                ) : (
                  <Select
                    value={toTimeValue(endDt)}
                    onValueChange={(val) => {
                      const { h, m } = fromTimeValue(val);
                      setEndDt(setTimeOnDate(endDt, h, m));
                      if (errors.endDt)
                        setErrors((p) => ({ ...p, endDt: undefined }));
                    }}
                  >
                    <SelectTrigger className="w-fit h-auto px-3 py-2 rounded-lg text-sm bg-white/[0.06] border border-white/[0.08] text-white/80 hover:bg-white/10 shadow-none focus:ring-0 focus:ring-offset-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[220px] bg-[#1e1e1e] border-white/10 text-white/80">
                      {TIME_SLOTS.map((s) => (
                        <SelectItem
                          key={s.value}
                          value={s.value}
                          className="focus:bg-white/10 focus:text-white/90 text-white/70"
                        >
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* End date picker (shown separately for multi-day) */}
                {readonly ? (
                  <div className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70 flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-white/30" />
                    {formatDatePill(endDt)}
                  </div>
                ) : (
                  <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-1.5",
                          "bg-white/[0.06] border border-white/[0.08] text-white/80 hover:bg-white/10 cursor-pointer",
                          endDateOpen && "border-purple-500/50 bg-white/10",
                        )}
                      >
                        <CalendarIcon className="w-3.5 h-3.5 text-white/40" />
                        {formatDatePill(endDt)}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 border-white/10 bg-[#1e1e1e]"
                      align="start"
                    >
                      <Calendar
                        mode="single"
                        selected={endDt}
                        onSelect={(d) => {
                          if (!d) return;
                          const updated = new Date(
                            d.getFullYear(),
                            d.getMonth(),
                            d.getDate(),
                            endDt.getHours(),
                            endDt.getMinutes(),
                            0,
                            0,
                          );
                          setEndDt(updated);
                          setEndDateOpen(false);
                        }}
                        disabled={(d) =>
                          d <
                          new Date(
                            startDt.getFullYear(),
                            startDt.getMonth(),
                            startDt.getDate(),
                          )
                        }
                        initialFocus
                        className="[&_.rdp]:text-white/80"
                      />
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {errors.endDt && (
                <p className="text-xs text-red-400 mt-1">{errors.endDt}</p>
              )}
            </div>

            {/* ── Description ── */}
            <div>
              <label className="block text-xs text-white/35 mb-1.5 tracking-wide">
                Description
              </label>
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

            {/* ── Google Meet toggle ── */}
            <div>
              <label className="block text-xs text-white/35 mb-1.5 tracking-wide">
                Meeting Room
              </label>
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded bg-blue-500/15 flex items-center justify-center">
                    <Video className="w-3.5 h-3.5 text-blue-400" />
                  </div>
                  <span className="text-sm text-white/80">
                    Create Google Meet
                  </span>
                </div>
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
