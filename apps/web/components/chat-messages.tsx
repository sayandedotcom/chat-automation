"use client";

import { useEffect, useRef } from "react";
import { Bot, User } from "lucide-react";

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
    <div
      ref={containerRef}
      className="h-full overflow-y-auto px-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
    >
      <div className="max-w-2xl mx-auto space-y-4 py-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${
              message.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {message.role === "assistant" && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === "user"
                  ? "bg-violet-600/80 text-white"
                  : "bg-white/10 text-white backdrop-blur-sm"
              }`}
              style={{
                boxShadow:
                  message.role === "user"
                    ? "0 4px 12px rgba(139, 92, 246, 0.3)"
                    : "0 4px 12px rgba(0, 0, 0, 0.2)",
              }}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
              <p className="text-[10px] text-white/50 mt-1">
                {message.timestamp.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>

            {message.role === "user" && (
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="bg-white/10 text-white backdrop-blur-sm rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span
                  className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
