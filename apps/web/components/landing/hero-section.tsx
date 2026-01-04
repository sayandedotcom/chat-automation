"use client";
import { StarsBackground } from "@workspace/ui/components/stars-background";
import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { Button } from "@workspace/ui/components/button";
import { useScroll, useTransform, motion } from "framer-motion";
import { useRef } from "react";

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-start min-h-[120vh] w-full overflow-hidden bg-black text-white pt-32 md:pt-40"
    >
      <div className="absolute inset-0 z-0 top-0 h-screen">
        <StarsBackground className="h-full" starDensity={0.0002} />
        <ShootingStars />
      </div>

      {/* Radial Gradient */}
      <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-900/30 rounded-full blur-[100px] pointer-events-none" />

      <div className="z-10 flex flex-col items-center text-center max-w-5xl px-4 gap-8">
        <h1 className="text-5xl md:text-8xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-neutral-400 pb-2">
          AI that actually
          <br /> works for you.
        </h1>
        <p className="text-lg md:text-xl text-neutral-400 max-w-2xl leading-relaxed">
          Chat Automations is an AI coworker that understands you, your team,
          <br className="hidden md:block" /> and your tools to get work done for
          you.
        </p>
        <div className="flex gap-4 mt-4">
          <Button className="rounded-full bg-gradient-to-r from-[#5d44df] to-[#4f37cb] hover:opacity-90 transition-opacity px-10 py-7 text-lg shadow-[0_0_40px_rgba(93,68,223,0.4)] border border-white/10">
            Get Started
          </Button>
        </div>
      </div>

      {/* Dashboard Mockup with 3D perspective */}
      <div className="z-20 mt-20 w-full max-w-6xl px-4 [perspective:2000px]">
        <motion.div
          initial={{ rotateX: 20, opacity: 0, y: 100 }}
          animate={{ rotateX: 0, opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md shadow-2xl overflow-hidden"
        >
          {/* Window Controls */}
          <div className="flex items-center gap-2 px-4 py-4 border-b border-white/5 bg-white/5">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
            <div className="ml-4 text-xs text-neutral-500 font-medium">
              Chat Automations AI
            </div>
          </div>

          {/* App Content */}
          <div className="p-4 md:p-8 h-[500px] md:h-[600px] flex flex-col gap-6 relative bg-gradient-to-br from-black to-neutral-900/50">
            {/* Chat Message 1 (User) */}
            <div className="flex items-start gap-4 self-end max-w-xl">
              <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl rounded-tr-sm p-4 text-sm text-neutral-200">
                Clear my calendar for the rest of the week efficiently.
              </div>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-600 flex-shrink-0" />
            </div>

            {/* Chat Message 2 (AI) */}
            <div className="flex items-start gap-4 max-w-2xl">
              <div className="w-8 h-8 rounded-full bg-[#5d44df] flex items-center justify-center flex-shrink-0 text-xs font-bold">
                D
              </div>
              <div className="flex flex-col gap-2">
                <div className="bg-[#5d44df]/10 border border-[#5d44df]/20 rounded-2xl rounded-tl-sm p-5 text-sm text-neutral-200 shadow-[0_0_30px_rgba(93,68,223,0.1)]">
                  <p className="mb-3">
                    I analyzed your schedule. You have 3 recurring status
                    meetings and 2 1:1s remaining.
                  </p>
                  <p className="mb-4">
                    I've drafted cancellations for low-priority syncs and
                    rescheduled the 1:1s to next week. You validated 6 hours of
                    focus time.
                  </p>

                  {/* Card inside chat */}
                  <div className="bg-black/40 rounded-xl border border-white/5 overflow-hidden">
                    <div className="p-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-300">
                        Calendar Actions
                      </span>
                      <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                        Completed
                      </span>
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-3 text-xs text-neutral-400 p-2 hover:bg-white/5 rounded transition-colors">
                        <div className="w-4 h-4 rounded-full border border-red-500/50 flex items-center justify-center text-red-500">
                          ✕
                        </div>
                        <span className="text-neutral-300 line-through">
                          Product Sync
                        </span>
                        <span className="ml-auto">Canceled</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-400 p-2 hover:bg-white/5 rounded transition-colors">
                        <div className="w-4 h-4 rounded-full border border-green-500/50 flex items-center justify-center text-green-500">
                          ➜
                        </div>
                        <span className="text-neutral-300">
                          Engineering 1:1
                        </span>
                        <span className="ml-auto">Moved to Mon</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Glow effect behind the container to simulate screen emission */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#5d44df]/10 via-transparent to-transparent pointer-events-none" />
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent z-20" />
    </div>
  );
}
