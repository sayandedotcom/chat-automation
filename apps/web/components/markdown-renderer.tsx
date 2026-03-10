import React from "react";

import "highlight.js/styles/github-dark.css";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";

// or another style

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="prose prose-sm prose-invert prose-p:leading-relaxed prose-pre:p-0 prose-p:text-zinc-300 prose-headings:text-zinc-200 prose-headings:font-semibold prose-strong:text-zinc-200 prose-a:text-zinc-400 prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-zinc-300 prose-code:text-zinc-300 prose-code:bg-transparent prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-ul:my-2 prose-li:my-0 prose-li:text-zinc-300 max-w-none break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ node, ...props }) => (
            <div className="relative my-4 overflow-hidden rounded-lg border border-white/10 bg-[#1e1e1e]">
              <pre {...props} className="overflow-x-auto p-4 text-sm" />
            </div>
          ),
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match;
            return isInline ? (
              <code
                className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[13px] text-zinc-300"
                {...props}>
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
