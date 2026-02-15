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
      className="prose prose-invert prose-p:leading-relaxed prose-pre:p-0 break-words max-w-none
        prose-p:text-gray-300 prose-headings:text-gray-100 prose-headings:font-semibold
        prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
        prose-code:text-emerald-400 prose-code:bg-transparent prose-code:font-normal prose-code:before:content-none prose-code:after:content-none
        prose-ul:my-2 prose-li:my-0
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
                className="px-1.5 py-0.5 rounded-md bg-white/10 text-emerald-300 font-mono text-sm"
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
