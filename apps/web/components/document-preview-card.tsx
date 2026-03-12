"use client";

import { useState } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, FileText, RotateCcw } from "lucide-react";

import { Button } from "@workspace/ui/components/button";
import { MarkdownRenderer } from "@workspace/ui/components/tiptap-markdown-renderer";
import { cn } from "@workspace/ui/lib/utils";

interface DocumentPreviewCardProps {
  title: string;
  content: string;
  icon?: React.ReactNode;
  onApprove?: () => void;
  onCancel?: () => void;
  onEdit?: (content: string) => void;
  isLoading?: boolean;
  className?: string;
}

export function DocumentPreviewCard({
  title,
  content,
  icon,
  onApprove,
  onCancel,
  isLoading = false,
  className,
}: DocumentPreviewCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1a]",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        className
      )}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
            {icon || <FileText className="h-4 w-4 text-black" />}
          </div>
          <span className="text-sm font-medium text-white/90">Create Document</span>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 text-xs text-white/50 transition-colors hover:text-white/70">
          <span>Permissions</span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-200",
              isCollapsed && "rotate-180"
            )}
          />
        </button>
      </div>

      {/* Content preview */}
      <AnimatePresence initial={false}>
        {!isCollapsed && (
          <motion.div
            key="collapsible"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden">
            <div className="scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent max-h-80 overflow-y-auto px-5 py-5">
              {/* Document title */}
              <h2 className="mb-4 text-2xl leading-tight font-bold tracking-tight text-white">
                {title}
              </h2>

              {/* Document content - rendered as markdown */}
              <MarkdownRenderer content={content} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer with actions */}
      <div className="flex items-center justify-center gap-2 border-t border-white/5 bg-[#151515] px-4 py-3">
        <button className="rounded-lg p-2 transition-colors hover:bg-white/5">
          <RotateCcw className="h-4 w-4 text-white/50" />
        </button>

        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          className="h-9 border-red-500/30 bg-red-500/20 px-4 text-red-300 hover:bg-red-500/30 hover:text-red-200">
          Cancel
        </Button>

        <Button
          size="sm"
          onClick={onApprove}
          disabled={isLoading}
          className="h-9 gap-2 bg-purple-600 px-4 text-white hover:bg-purple-700">
          {isLoading ? (
            "Creating..."
          ) : (
            <>
              Create
              <span className="flex items-center gap-0.5 text-xs text-white/60">
                <span className="text-[10px]">⌘</span>
                <span>↵</span>
              </span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
