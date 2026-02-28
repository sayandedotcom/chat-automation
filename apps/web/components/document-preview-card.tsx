"use client";

import { useState } from "react";
import { FileText, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { MarkdownRenderer } from "./markdown-renderer";

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
        "rounded-2xl bg-[#1a1a1a] border border-white/10 overflow-hidden",
        "animate-in fade-in slide-in-from-top-2 duration-300",
        className,
      )}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
            {icon || <FileText className="w-4 h-4 text-blue-400" />}
          </div>
          <span className="text-sm font-medium text-white/90">
            Create Document
          </span>
        </div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          <span>Permissions</span>
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 transition-transform duration-200",
              isCollapsed && "rotate-180",
            )}
          />
        </button>
      </div>

      {/* Content preview */}
      {!isCollapsed && (
        <div className="px-5 py-5 max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {/* Document title */}
          <h2 className="text-2xl font-bold text-white mb-4 leading-tight tracking-tight">
            {title}
          </h2>

          {/* Document content - rendered as markdown */}
          <MarkdownRenderer content={content} />
        </div>
      )}

      {/* Footer with actions */}
      <div className="px-4 py-3 flex items-center justify-center gap-2 border-t border-white/5 bg-[#151515]">
        <button className="p-2 rounded-lg hover:bg-white/5 transition-colors">
          <RotateCcw className="w-4 h-4 text-white/50" />
        </button>

        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
          className="px-4 h-9 bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30 hover:text-red-200"
        >
          Cancel
        </Button>

        <Button
          size="sm"
          onClick={onApprove}
          disabled={isLoading}
          className="px-4 h-9 bg-purple-600 hover:bg-purple-700 text-white gap-2"
        >
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
