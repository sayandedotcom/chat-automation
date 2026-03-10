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
        className="flex items-center gap-1.5 text-sm text-white/50 hover:text-white/70 transition-colors group"
      >
        <span className="font-medium">Thought</span>
        <span className="text-white/30">for {duration}s</span>
        <ChevronRight
          className={cn(
            "w-3.5 h-3.5 text-white/40 transition-transform duration-200",
            isExpanded && "rotate-90",
          )}
        />
      </button>

      {/* Expanded thinking content */}
      {isExpanded && (
        <div className="mt-1.5">
          <div className="pl-4 border-l border-white/10">
            <p className="text-sm text-white/40 leading-relaxed italic">
              {content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
