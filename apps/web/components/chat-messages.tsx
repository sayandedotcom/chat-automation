"use client";

import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";
import { MarkdownRenderer } from "./markdown-renderer";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading?: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0a0a]">
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-4 scroll-smooth"
      >
        <div className="max-w-3xl mx-auto space-y-6 pb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-4 ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mt-1">
                  <Bot className="w-5 h-5 text-white/80" />
                </div>
              )}

              <div
                className={`group relative max-w-[85%] ${
                  message.role === "user"
                    ? "bg-[#2a2a2a] text-white px-5 py-3.5 rounded-3xl rounded-tr-sm" // User styling
                    : "text-gray-100 pl-0 pr-0 py-1" // Assistant styling (clean text)
                }`}
              >
                {message.role === "user" ? (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </p>
                ) : (
                  <MarkdownRenderer content={message.content} />
                )}

                {/* Timestamp - visible on hover or always for assistant? Let's keep it subtle */}
                <div
                  className={`text-[10px] text-white/30 mt-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-5 ${
                    message.role === "user" ? "right-1" : "left-1"
                  }`}
                >
                  {message.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              {message.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mt-1">
                  <User className="w-5 h-5 text-white/80" />
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex gap-4 justify-start animate-pulse">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
                <Bot className="w-5 h-5 text-white/50" />
              </div>
              <div className="flex items-center gap-1 h-8">
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>
    </div>
  );
}
