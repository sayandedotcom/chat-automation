"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";

interface ThinkingIndicatorProps {
  content: string;
  duration?: number;
  defaultExpanded?: boolean;
  className?: string;
}

export function ThinkingIndicator({
  content,
  duration = 2,
  defaultExpanded = false,
  className,
}: ThinkingIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn("relative", className)}>
      {/* Thinking header - clickable to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-sm text-[#9b7fdb] hover:text-[#b69be8] transition-colors group"
      >
        <span className="text-white/40">•</span>
        <span className="font-medium">Thought</span>
        <span className="text-white/40">for {duration}s</span>
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-white/40 transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        />
      </button>

      {/* Expanded thinking content */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          isExpanded ? "max-h-96 opacity-100 mt-1.5" : "max-h-0 opacity-0",
        )}
      >
        <div className="pl-4 border-l border-white/10">
          <p className="text-sm text-[#9b7fdb]/80 leading-relaxed italic">
            {content}
          </p>
        </div>
      </div>
    </div>
  );
}
