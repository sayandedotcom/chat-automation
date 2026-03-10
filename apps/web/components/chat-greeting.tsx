"use client";

import { useEffect, useState } from "react";

function getGreeting(hour: number): string {
  if (hour >= 5 && hour < 12) {
    return "Good Morning";
  } else if (hour >= 12 && hour < 17) {
    return "Good Afternoon";
  } else if (hour >= 17 && hour < 21) {
    return "Good Evening";
  } else {
    return "Good Night";
  }
}

function formatDate(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();

  // Add ordinal suffix
  const suffix =
    dayNum === 1 || dayNum === 21 || dayNum === 31
      ? "st"
      : dayNum === 2 || dayNum === 22
        ? "nd"
        : dayNum === 3 || dayNum === 23
          ? "rd"
          : "th";

  return `${dayName}, ${monthName} ${dayNum}${suffix}`;
}

interface ChatGreetingProps {
  userName?: string;
  subtitle?: string;
}

export function ChatGreeting({ userName = "Sayan", subtitle }: ChatGreetingProps) {
  const [mounted, setMounted] = useState(false);
  const [dateStr, setDateStr] = useState("");
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const now = new Date();
    setDateStr(formatDate(now));
    setGreeting(getGreeting(now.getHours()));
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="mb-6 w-full space-y-1">
        <div className="bg-muted/20 h-5 w-48 animate-pulse rounded" />
        <div className="bg-muted/20 h-10 w-80 animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="mb-6 w-full space-y-1 pl-4">
      <p className="text-base tracking-wide text-[#71717a]">{dateStr}</p>
      <h1 className="bg-gradient-to-r from-gray-200 via-gray-400 to-gray-500 bg-clip-text text-3xl font-normal tracking-tight text-transparent md:text-4xl">
        {greeting}, {userName}
      </h1>
      {subtitle && <p className="mt-2 text-sm text-[#71717a]">{subtitle}</p>}
    </div>
  );
}
