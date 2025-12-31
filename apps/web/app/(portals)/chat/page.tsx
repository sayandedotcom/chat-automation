"use client";

import { useState, useCallback } from "react";
import { PlanetaryBackground } from "@/components/planetary-background";
import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { StarsBackground } from "@workspace/ui/components/stars-background";
import { ChatGreeting } from "@/components/chat-greeting";
import { ChatMessages, ChatMessage } from "@/components/chat-messages";
import { ChatInputWithMentions } from "@/components/chat-input";

// Simple mock responses for demonstration
const mockResponses = [
  "Hello! I'm your AI assistant. How can I help you today?",
  "That's a great question! Let me think about that...",
  "I'd be happy to help you with that. Here's what I found:",
  "Interesting! Could you tell me more about what you're looking for?",
  "I understand. Let me provide you with some information on that topic.",
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

    // Simulate AI response delay
    await new Promise((resolve) =>
      setTimeout(resolve, 1000 + Math.random() * 1000)
    );

    // Add mock AI response
    const aiMessage: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content:
        mockResponses[Math.floor(Math.random() * mockResponses.length)] || "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, aiMessage]);
    setIsLoading(false);
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
