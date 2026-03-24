"use client";

import { useEffect, useMemo } from "react";

import { EditorContent, useEditor } from "@tiptap/react";

import { cn } from "@workspace/ui/lib/utils";

import { createMarkdownExtensions } from "./tiptap-extensions";

interface TipTapMarkdownRendererProps {
  content: string;
  className?: string;
}

export function TipTapMarkdownRenderer({ content, className }: TipTapMarkdownRendererProps) {
  const extensions = useMemo(() => createMarkdownExtensions({ editable: false }), []);

  const editor = useEditor({
    extensions,
    content,
    editable: false,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && content !== undefined) {
      const current =
        (
          editor.storage as { markdown?: { getMarkdown?: () => string } }
        ).markdown?.getMarkdown?.() ?? "";
      if (current !== content) {
        editor.commands.setContent(content);
      }
    }
  }, [editor, content]);

  return (
    <>
      <style>{`
        .tiptap-renderer .tiptap { outline: none; }
        .tiptap-renderer .tiptap pre {
          position: relative;
          overflow: hidden;
          margin: 1rem 0;
          border-radius: 0.5rem;
          border: 1px solid rgba(255,255,255,0.1);
          background: #1e1e1e;
        }
        .tiptap-renderer .tiptap pre code {
          display: block;
          overflow-x: auto;
          padding: 1rem;
          font-size: 0.875rem;
          background: transparent;
          color: inherit;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .tiptap-renderer .tiptap code:not(pre code) {
          border-radius: 0.375rem;
          background: rgba(255,255,255,0.1);
          padding: 0.125rem 0.375rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          color: rgb(212,212,212);
        }
        .tiptap-renderer .tiptap a {
          color: rgb(161,161,170);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .tiptap-renderer .tiptap a:hover { color: rgb(212,212,216); }
        .tiptap-renderer .tiptap ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        .tiptap-renderer .tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
        .tiptap-renderer .tiptap ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 0.25rem; accent-color: #a855f7; }
        .tiptap-renderer .tiptap table {
          border-collapse: separate;
          border-spacing: 0;
          width: 100%;
          margin: 1.5rem 0;
          border-radius: 1rem;
          background: #1a1a1a;
          border: 1px solid rgba(255,255,255,0.15);
          overflow: hidden;
        }
        .tiptap-renderer .tiptap table th,
        .tiptap-renderer .tiptap table td {
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding: 0.375rem 0.75rem;
          text-align: left;
          vertical-align: top;
        }
        .tiptap-renderer .tiptap table tr:last-child td {
          border-bottom: none;
        }
        .tiptap-renderer .tiptap table th {
          background: transparent;
          font-weight: 500;
          font-size: 0.875rem;
          color: rgba(255,255,255,0.9);
        }
        .tiptap-renderer .tiptap table td {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.6);
        }
        .tiptap-renderer .tiptap blockquote { border-left: 3px solid rgba(255,255,255,0.2); padding-left: 1rem; color: rgba(255,255,255,0.5); }
        .tiptap-renderer .tiptap hr { border-color: rgba(255,255,255,0.1); }
        .tiptap-renderer .hljs-keyword, .tiptap-renderer .hljs-selector-tag { color: #569cd6; }
        .tiptap-renderer .hljs-string, .tiptap-renderer .hljs-attr { color: #ce9178; }
        .tiptap-renderer .hljs-number, .tiptap-renderer .hljs-literal { color: #b5cea8; }
        .tiptap-renderer .hljs-comment { color: #6a9955; }
        .tiptap-renderer .hljs-function, .tiptap-renderer .hljs-title { color: #dcdcaa; }
        .tiptap-renderer .hljs-variable, .tiptap-renderer .hljs-name { color: #9cdcfe; }
        .tiptap-renderer .hljs-type, .tiptap-renderer .hljs-class { color: #4ec9b0; }
        .tiptap-renderer .hljs-built_in { color: #4ec9b0; }
        .tiptap-renderer .hljs-operator, .tiptap-renderer .hljs-punctuation { color: #d4d4d4; }
        .tiptap-renderer .hljs-property { color: #9cdcfe; }
        .tiptap-renderer .hljs-tag { color: #569cd6; }
        .tiptap-renderer .hljs-meta { color: #c586c0; }
        .tiptap-renderer .hljs-section { color: #dcdcaa; }
      `}</style>
      <div
        className={cn(
          "tiptap-renderer prose prose-sm prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-p:text-zinc-300 prose-headings:text-zinc-200 prose-headings:font-semibold prose-strong:text-zinc-200 prose-a:text-zinc-400 prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-zinc-300 prose-code:text-zinc-300 prose-code:bg-transparent prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-ul:my-2 prose-li:my-0 prose-li:text-zinc-300 max-w-none break-words",
          className
        )}>
        <EditorContent editor={editor} />
      </div>
    </>
  );
}

// Drop-in alias for easy migration
export { TipTapMarkdownRenderer as MarkdownRenderer };
