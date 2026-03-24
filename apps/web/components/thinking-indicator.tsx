"use client";

import { useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
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
        className="group flex items-center gap-1.5 text-sm text-white/50 transition-colors hover:text-white/70">
        <span className="font-medium">Thought</span>
        <span className="text-white/30">for {duration}s</span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 text-white/40 transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />
      </button>

      {/* Expanded thinking content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="thinking-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden">
            <div className="mt-1.5">
              <p className="text-sm leading-relaxed text-white/40 italic">{content}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
