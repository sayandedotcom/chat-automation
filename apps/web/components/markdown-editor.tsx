"use client";

import dynamic from "next/dynamic";
import { cn } from "@workspace/ui/lib/utils";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  maxHeight?: number;
  className?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write content...",
  readOnly = false,
  maxHeight = 320,
  className,
}: MarkdownEditorProps) {
  return (
    <div
      className={cn("markdown-editor-wrapper", className)}
      data-color-mode="dark"
    >
      <MDEditor
        value={value}
        onChange={(val) => onChange(val ?? "")}
        preview={readOnly ? "preview" : "edit"}
        hideToolbar
        visibleDragbar={false}
        textareaProps={{ placeholder }}
        height={maxHeight}
        style={{
          backgroundColor: "transparent",
          boxShadow: "none",
          border: "none",
        }}
      />
      <style jsx global>{`
        .markdown-editor-wrapper .w-md-editor {
          background: transparent !important;
          box-shadow: none !important;
          border: none !important;
          color: inherit !important;
        }
        .markdown-editor-wrapper .w-md-editor-text-pre > code,
        .markdown-editor-wrapper .w-md-editor-text-input,
        .markdown-editor-wrapper .w-md-editor-text {
          font-size: 14px !important;
          line-height: 1.7 !important;
          color: rgba(255, 255, 255, 0.7) !important;
          font-family: inherit !important;
        }
        .markdown-editor-wrapper .w-md-editor-text-input::placeholder {
          color: rgba(255, 255, 255, 0.25) !important;
        }
        .markdown-editor-wrapper .w-md-editor-preview {
          background: transparent !important;
          padding: 0 !important;
        }
        .markdown-editor-wrapper .wmde-markdown {
          background: transparent !important;
          font-family: inherit !important;
          font-size: 14px !important;
          color: rgba(255, 255, 255, 0.7) !important;
        }
        .markdown-editor-wrapper .wmde-markdown h1,
        .markdown-editor-wrapper .wmde-markdown h2,
        .markdown-editor-wrapper .wmde-markdown h3,
        .markdown-editor-wrapper .wmde-markdown h4 {
          color: rgba(255, 255, 255, 0.9) !important;
          border-bottom: none !important;
          font-weight: 600 !important;
        }
        .markdown-editor-wrapper .wmde-markdown strong {
          color: rgba(255, 255, 255, 0.85) !important;
        }
        .markdown-editor-wrapper .wmde-markdown ul,
        .markdown-editor-wrapper .wmde-markdown ol {
          color: rgba(255, 255, 255, 0.7) !important;
        }
        .markdown-editor-wrapper .wmde-markdown code {
          background: rgba(255, 255, 255, 0.1) !important;
          color: rgba(255, 255, 255, 0.8) !important;
          border-radius: 4px !important;
          padding: 2px 6px !important;
        }
        .markdown-editor-wrapper .wmde-markdown pre {
          background: #1e1e1e !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          border-radius: 8px !important;
        }
        .markdown-editor-wrapper .wmde-markdown pre code {
          background: transparent !important;
          padding: 0 !important;
        }
        .markdown-editor-wrapper .wmde-markdown a {
          color: rgba(255, 255, 255, 0.5) !important;
        }
        .markdown-editor-wrapper .wmde-markdown hr {
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        .markdown-editor-wrapper .wmde-markdown blockquote {
          border-left-color: rgba(255, 255, 255, 0.2) !important;
          color: rgba(255, 255, 255, 0.5) !important;
        }
        .markdown-editor-wrapper .wmde-markdown table th,
        .markdown-editor-wrapper .wmde-markdown table td {
          border-color: rgba(255, 255, 255, 0.1) !important;
        }
        .markdown-editor-wrapper .wmde-markdown input[type="checkbox"] {
          accent-color: #a855f7;
        }
        .markdown-editor-wrapper .w-md-editor-content {
          min-height: 80px;
        }
        .markdown-editor-wrapper .w-md-editor-area {
          overflow-y: auto !important;
        }
        /* Hide the internal toolbar/bar area */
        .markdown-editor-wrapper .w-md-editor-toolbar {
          display: none !important;
        }
        .markdown-editor-wrapper .w-md-editor-bar {
          display: none !important;
        }
      `}</style>
    </div>
  );
}
