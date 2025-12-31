"use client";

import { Mic, Plus, Send } from "lucide-react";
import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@workspace/ui/components/button";

interface NewChatInputProps {
  onSubmit?: (message: string) => void;
  placeholder?: string;
}

export function NewChatInput({
  onSubmit,
  placeholder = "Type and press enter to start chatting...",
}: NewChatInputProps) {
  const [message, setMessage] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }, [message]);

  const handleSubmit = () => {
    if (message.trim()) {
      onSubmit?.(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(30, 30, 50, 0.9) 0%, rgba(20, 20, 35, 0.95) 100%)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow:
            "0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* Main input area */}
        <div className="flex items-center gap-3 p-4">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder:text-gray-500 text-sm resize-none outline-none min-h-[24px] max-h-[120px] py-0.5 leading-relaxed"
          />
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-4 pb-3 pt-0">
          <div className="flex items-center gap-2">
            {/* Plus button */}
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200">
              <Plus className="h-4 w-4" />
            </button>

            {/* Auto toggle */}
            <button
              onClick={() => setAutoMode(!autoMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                autoMode
                  ? "bg-white/15 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              Auto
              <div
                className={`w-7 h-4 rounded-full relative transition-colors duration-200 ${
                  autoMode ? "bg-emerald-500" : "bg-white/20"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    autoMode ? "translate-x-3.5" : "translate-x-0.5"
                  }`}
                />
              </div>
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Mic button */}
            <button className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200">
              <Mic className="h-4 w-4" />
            </button>

            {/* Send button */}
            <button
              onClick={handleSubmit}
              disabled={!message.trim()}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                message.trim()
                  ? "bg-white/15 text-white hover:bg-white/25"
                  : "text-gray-500 cursor-not-allowed"
              }`}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
