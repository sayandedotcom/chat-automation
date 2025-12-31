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
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
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
}

export function ChatGreeting({ userName = "Sayan" }: ChatGreetingProps) {
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
      <div className="text-center space-y-2 mb-8">
        <div className="h-5 w-48 bg-muted/20 rounded animate-pulse mx-auto" />
        <div className="h-12 w-80 bg-muted/20 rounded animate-pulse mx-auto" />
      </div>
    );
  }

  return (
    <div className="text-center space-y-2 mb-8">
      <p className="text-sm text-muted-foreground tracking-wide">{dateStr}</p>
      <h1 className="text-4xl md:text-5xl font-semibold text-white tracking-tight">
        {greeting}, {userName}
      </h1>
    </div>
  );
}
