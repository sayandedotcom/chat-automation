"use client";

import { useEffect, useMemo, useRef } from "react";

import { EditorContent, useEditor } from "@tiptap/react";

import { cn } from "@workspace/ui/lib/utils";

import { createMarkdownExtensions } from "./tiptap-extensions";

interface TipTapMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  maxHeight?: number;
  className?: string;
}

export function TipTapMarkdownEditor({
  value,
  onChange,
  placeholder = "Write content...",
  readOnly = false,
  maxHeight = 320,
  className,
}: TipTapMarkdownEditorProps) {
  const extensions = useMemo(() => createMarkdownExtensions({ editable: !readOnly }), [readOnly]);
  const lastEmittedValue = useRef<string>(value);

  const editor = useEditor(
    {
      extensions,
      content: value,
      editable: !readOnly,
      immediatelyRender: false,
      onUpdate: ({ editor }) => {
        const markdown =
          (
            editor.storage as { markdown?: { getMarkdown?: () => string } }
          ).markdown?.getMarkdown?.() ?? "";
        lastEmittedValue.current = markdown;
        onChange(markdown);
      },
    },
    [extensions]
  );

  // Sync external value changes (but not echo-backs from our own onChange)
  useEffect(() => {
    if (!editor) return;
    const current =
      (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown?.getMarkdown?.() ??
      "";
    if (value !== current && value !== lastEmittedValue.current) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  // Sync editable state
  useEffect(() => {
    if (editor && editor.isEditable === readOnly) {
      editor.setEditable(!readOnly);
    }
  }, [editor, readOnly]);

  return (
    <>
      <style>{`
        .tiptap-editor .tiptap {
          outline: none;
          font-size: 14px;
          line-height: 1.7;
          color: rgba(255,255,255,0.7);
          font-family: inherit;
          min-height: 80px;
        }
        .tiptap-editor .tiptap p.is-editor-empty:first-child::before {
          color: rgba(255,255,255,0.25);
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .tiptap-editor .tiptap pre {
          position: relative;
          overflow: hidden;
          margin: 1rem 0;
          border-radius: 0.5rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: #1e1e1e;
        }
        .tiptap-editor .tiptap pre code {
          display: block;
          overflow-x: auto;
          padding: 1rem;
          font-size: 0.875rem;
          background: transparent;
          color: inherit;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .tiptap-editor .tiptap code:not(pre code) {
          border-radius: 4px;
          background: rgba(255,255,255,0.1);
          padding: 2px 6px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: rgba(255,255,255,0.8);
        }
        .tiptap-editor .tiptap h1, .tiptap-editor .tiptap h2,
        .tiptap-editor .tiptap h3, .tiptap-editor .tiptap h4 {
          color: rgba(255,255,255,0.9);
          font-weight: 600;
        }
        .tiptap-editor .tiptap strong { color: rgba(255,255,255,0.85); }
        .tiptap-editor .tiptap a {
          color: rgba(255,255,255,0.5);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .tiptap-editor .tiptap ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        .tiptap-editor .tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
        .tiptap-editor .tiptap ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.25rem; accent-color: #a855f7; }
        .tiptap-editor .tiptap table {
          border-collapse: separate;
          border-spacing: 0;
          width: 100%;
          margin: 1.5rem 0;
          border-radius: 1rem;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.15);
          overflow: hidden;
        }
        .tiptap-editor .tiptap table th,
        .tiptap-editor .tiptap table td {
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding: 0.375rem 0.75rem;
          text-align: left;
          vertical-align: top;
        }
        .tiptap-editor .tiptap table tr:last-child td {
          border-bottom: none;
        }
        .tiptap-editor .tiptap table th {
          background: transparent;
          font-weight: 500;
          font-size: 0.875rem;
          color: rgba(255,255,255,0.9);
        }
        .tiptap-editor .tiptap table td {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.6);
        }
        .tiptap-editor .tiptap ul,
        .tiptap-editor .tiptap ol { padding-left: 1.5rem; margin: 0.5rem 0; }
        .tiptap-editor .tiptap ul { list-style-type: disc; }
        .tiptap-editor .tiptap ol { list-style-type: decimal; }
        .tiptap-editor .tiptap li { margin: 0.125rem 0; color: rgba(255,255,255,0.7); }
        .tiptap-editor .tiptap li p { margin: 0; }
        .tiptap-editor .tiptap blockquote {
          border-left: 3px solid rgba(255,255,255,0.2);
          padding-left: 1rem;
          color: rgba(255,255,255,0.5);
        }
        .tiptap-editor .tiptap hr { border-color: rgba(255,255,255,0.1); }
      `}</style>
      <div
        className={cn(
          "tiptap-editor prose prose-sm prose-invert prose-ul:my-2 prose-li:my-0 prose-li:text-zinc-300 prose-p:leading-relaxed prose-p:text-zinc-300 prose-headings:text-zinc-200 prose-headings:font-semibold prose-strong:text-zinc-200 max-w-none overflow-y-auto",
          className
        )}
        style={{ maxHeight }}>
        <EditorContent editor={editor} data-placeholder={placeholder} />
      </div>
    </>
  );
}

// Drop-in alias for easy migration
export { TipTapMarkdownEditor as MarkdownEditor };
