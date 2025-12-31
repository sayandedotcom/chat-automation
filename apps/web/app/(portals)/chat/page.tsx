import { ChatInputWithMentions } from "@/components/chat-input";
import { ShootingStarsAndStarsBackground } from "@/components/shooting-stars-and-star-background";
import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { StarsBackground } from "@workspace/ui/components/stars-background";
import React from "react";

export default function ChatPage() {
  return (
    <>
      <ShootingStarsAndStarsBackground>
        <h2 className="relative flex-col md:flex-row z-10 text-3xl md:text-5xl md:leading-tight max-w-5xl mx-auto text-center tracking-tight font-medium bg-clip-text text-transparent bg-gradient-to-b from-neutral-800 via-white to-white flex items-center gap-2 md:gap-8">
          <span>Shooting Star</span>
          <span>Star Background</span>
        </h2>
        <ChatInputWithMentions />
        <ShootingStars />
        <StarsBackground />
      </ShootingStarsAndStarsBackground>
    </>
  );
}
