"use client";

import { useState, useCallback, useRef } from "react";
import { PlanetaryBackground } from "@/components/planetary-background";
import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { StarsBackground } from "@workspace/ui/components/stars-background";
import { ChatGreeting } from "@/components/chat-greeting";
import { ChatMessages, ChatMessage } from "@/components/chat-messages";
import { ChatInputWithMentions } from "@/components/chat-input";

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const threadIdRef = useRef<string | null>(null);

  const handleSubmit = useCallback(async (content: string) => {
    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Call the chat API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: content,
          thread_id: threadIdRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();

      // Store thread_id for conversation continuity
      if (data.thread_id) {
        threadIdRef.current = data.thread_id;
      }

      // Add AI response
      const aiMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: data.response || "Sorry, I could not process your request.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Chat error:", error);

      // Add error message
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content:
          "Sorry, there was an error processing your request. Please make sure the agent server is running.",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <PlanetaryBackground
      backgroundContent={
        <>
          <ShootingStars />
          <StarsBackground />
        </>
      }
    >
      <div className="flex flex-col w-full h-full z-10 relative">
        {/* Empty state with greeting */}
        {!hasMessages && (
          <div className="flex-1 flex flex-col items-center justify-center px-4">
            <ChatGreeting userName="Sayan" />
            <ChatInputWithMentions onSubmit={handleSubmit} />
          </div>
        )}

        {/* Chat state with messages */}
        {hasMessages && (
          <>
            {/* Messages area - takes remaining space */}
            <div className="flex-1 overflow-hidden pt-6">
              <ChatMessages messages={messages} isLoading={isLoading} />
            </div>

            {/* Input at the bottom */}
            <div className="flex-shrink-0 pb-6 px-4">
              <ChatInputWithMentions onSubmit={handleSubmit} />
            </div>
          </>
        )}
      </div>
    </PlanetaryBackground>
  );
}
