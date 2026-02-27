import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css"; // or another style

interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div
      className="prose prose-sm prose-invert prose-p:leading-relaxed prose-pre:p-0 break-words max-w-none
        prose-p:text-zinc-300 prose-headings:text-zinc-200 prose-headings:font-semibold
        prose-strong:text-zinc-200
        prose-a:text-zinc-400 prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-zinc-300
        prose-code:text-zinc-300 prose-code:bg-transparent prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
        prose-ul:my-2 prose-li:my-0 prose-li:text-zinc-300
      "
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ node, ...props }) => (
            <div className="relative my-4 overflow-hidden rounded-lg bg-[#1e1e1e] border border-white/10">
              <pre {...props} className="p-4 overflow-x-auto text-sm" />
            </div>
          ),
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match;
            return isInline ? (
              <code
                className="px-1.5 py-0.5 rounded-md bg-white/10 text-zinc-300 font-mono text-[13px]"
                {...props}
              >
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
