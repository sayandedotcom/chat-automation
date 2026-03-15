"use client";

import { useMemo, useState } from "react";

import Image from "next/image";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@workspace/ui/lib/utils";

export interface EmailResultData {
  message_id: string;
  thread_id?: string | null;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  is_unread?: boolean | null;
}

interface EmailListCardProps {
  emails: EmailResultData[];
  stepNumber: number;
  description: string;
}

const PAGE_SIZE = 5;

/** Extract display name from "Name <email>" format. */
function senderDisplayName(sender: string): string {
  const match = sender.match(/^"?([^"<]+)"?\s*</);
  if (match?.[1]) return match[1].trim();
  // No angle brackets — return as-is (probably just an email)
  return sender;
}

/** Format a date string to compact time (e.g. "02:40"). */
function formatTime(raw: string): string {
  if (!raw) return "";
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw.slice(0, 5);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return raw.slice(0, 5);
  }
}

export function EmailListCard({ emails }: EmailListCardProps) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(emails.length / PAGE_SIZE));
  const displayed = useMemo(
    () => emails.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [emails, page]
  );
  const rangeStart = page * PAGE_SIZE + 1;
  const rangeEnd = Math.min((page + 1) * PAGE_SIZE, emails.length);

  if (!emails.length) return null;

  return (
    <div
      className={cn(
        "bubble overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#1a1a1a]",
        "animate-in fade-in slide-in-from-top-2 duration-300"
      )}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
          <Image
            src="/integrations/gmail.svg"
            alt="Gmail"
            width={16}
            height={16}
            className="object-contain"
          />
        </div>
        <span className="text-sm font-medium text-white/90">E-Mail List</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.04]">
        {displayed.map((email) => (
          <a
            key={email.message_id}
            href={`https://mail.google.com/mail/u/0/#all/${email.message_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.03]">
            {/* Sender — fixed width, truncated */}
            <span
              className={cn(
                "w-[90px] flex-shrink-0 truncate text-sm",
                email.is_unread ? "font-semibold text-white/90" : "text-white/60"
              )}>
              {senderDisplayName(email.sender)}
            </span>

            {/* Unread dot */}
            <div className="flex w-3 flex-shrink-0 items-center justify-center">
              {email.is_unread && <span className="h-[6px] w-[6px] rounded-full bg-blue-400" />}
            </div>

            {/* Subject — fixed width when snippet exists, flex when no snippet */}
            <span
              className={cn(
                "truncate text-sm",
                email.snippet ? "w-[200px] flex-shrink-0" : "min-w-0 flex-1",
                email.is_unread ? "font-medium text-white/80" : "text-white/50"
              )}>
              {email.subject}
            </span>

            {/* Snippet / body preview — fills remaining space */}
            {email.snippet && (
              <span className="min-w-0 flex-1 truncate text-sm text-white/30">{email.snippet}</span>
            )}

            {/* Time — right aligned */}
            {formatTime(email.date) && (
              <span className="flex-shrink-0 text-xs text-white/30 tabular-nums">
                {formatTime(email.date)}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between border-t border-white/[0.04] px-5 py-2.5">
        <span className="text-xs text-white/30">
          {rangeStart} of {emails.length}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1 text-xs text-white/30">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded p-0.5 transition-colors hover:text-white/60 disabled:opacity-30">
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="rounded p-0.5 transition-colors hover:text-white/60 disabled:opacity-30">
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
