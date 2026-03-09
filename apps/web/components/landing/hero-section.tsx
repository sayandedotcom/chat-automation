"use client";

import Image from "next/image";
import { StarsBackground } from "@workspace/ui/components/stars-background";
import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { Button } from "@workspace/ui/components/button";
import { motion } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col items-center justify-start min-h-[140vh] w-full overflow-hidden bg-black text-white pt-32 md:pt-44"
    >
      <div className="absolute inset-0 z-0 top-0 h-screen">
        <StarsBackground className="h-full" starDensity={0.00015} />
        <ShootingStars />
      </div>

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[800px] bg-gradient-to-b from-[#533ccf]/20 via-[#533ccf]/10 to-transparent rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-40 left-0 w-[500px] h-[500px] bg-[#533ccf]/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="z-10 flex flex-col items-center text-center max-w-5xl px-4 gap-6">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-2xl md:text-4xl lg:text-5xl font-medium tracking-tight leading-[1.1]"
        >
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-400">
            AI that actually
          </span>
          <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-b from-neutral-300 to-neutral-500">
            works for you.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-sm text-neutral-400 max-w-2xl leading-relaxed"
        >
          An intelligent assistant that understands you, your team, and your tools.
          <br className="hidden md:block" />
          Automate the mundane. Focus on what matters.
        </motion.p>
      </div>

      <div className="z-20 mt-16 md:mt-24 w-full max-w-6xl px-4 [perspective:2000px]">
        <motion.div
          initial={{ rotateX: 25, opacity: 0, y: 100 }}
          animate={{ rotateX: 0, opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-900/80 to-black/90 backdrop-blur-xl shadow-2xl overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#533ccf]/5 via-transparent to-blue-500/5 pointer-events-none" />

          <div className="flex items-center gap-2 px-4 py-4 border-b border-white/5 bg-white/[0.02]">
            <div className="w-3 h-3 rounded-full bg-[#FF5F56]" />
            <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
            <div className="w-3 h-3 rounded-full bg-[#27C93F]" />
            <div className="ml-4 text-xs text-neutral-500 font-medium flex items-center gap-2">
              <Image src="/logo.png" alt="Logo" width={16} height={16} className="rounded" />
              Chat Automations
            </div>
            <div className="ml-auto flex items-center gap-4 text-xs text-neutral-600">
              <span>⌘K</span>
            </div>
          </div>

          <div className="p-4 md:p-6 h-[450px] md:h-[550px] flex flex-col gap-5 relative">
            <div className="flex items-start gap-4 self-end max-w-lg">
              <div className="bg-neutral-800/80 border border-white/5 rounded-2xl rounded-tr-sm p-4 text-sm text-neutral-200">
                <p>
                  Clear my calendar for the rest of the week and reschedule the important meetings
                  to next week.
                </p>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-600 to-neutral-700 flex-shrink-0 flex items-center justify-center text-xs font-medium">
                U
              </div>
            </div>

            <div className="flex items-start gap-4 max-w-2xl">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 shadow-[0_0_20px_rgba(83,60,207,0.3)]">
                <Image src="/logo.png" alt="Logo" width={36} height={36} className="rounded-full" />
              </div>
              <div className="flex flex-col gap-3">
                <div className="bg-[#533ccf]/10 border border-[#533ccf]/20 rounded-2xl rounded-tl-sm p-5 text-sm text-neutral-200 shadow-[0_0_40px_rgba(83,60,207,0.1)]">
                  <p className="mb-4">
                    I've analyzed your calendar and identified 5 meetings. I recommend canceling 3
                    low-priority syncs and rescheduling 2 important meetings to next week.
                  </p>

                  <div className="bg-black/50 rounded-xl border border-white/5 overflow-hidden">
                    <div className="p-3 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                      <span className="text-xs font-semibold text-neutral-300">
                        Calendar Actions
                      </span>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                        6h freed
                      </span>
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      {[
                        {
                          icon: "✕",
                          status: "Canceled",
                          name: "Product Sync",
                          color: "red",
                        },
                        {
                          icon: "➜",
                          status: "Moved to Mon",
                          name: "Engineering 1:1",
                          color: "green",
                        },
                        {
                          icon: "✕",
                          status: "Canceled",
                          name: "Team Standup",
                          color: "red",
                        },
                      ].map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 text-xs text-neutral-400 p-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                        >
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center text-[10px] ${
                              item.color === "red"
                                ? "border-red-500/50 text-red-400"
                                : "border-emerald-500/50 text-emerald-400"
                            }`}
                          >
                            {item.icon}
                          </div>
                          <span
                            className={
                              item.color === "red"
                                ? "text-neutral-500 line-through"
                                : "text-neutral-300"
                            }
                          >
                            {item.name}
                          </span>
                          <span className="ml-auto text-neutral-500">{item.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-neutral-500 ml-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#533ccf]" />
                  <span>Completed in 2.3s</span>
                </div>
              </div>
            </div>

            <div className="absolute bottom-4 left-0 right-0 px-4 md:px-6">
              <div className="flex items-center gap-3 bg-neutral-900/80 border border-white/5 rounded-xl p-3">
                <Image src="/logo.png" alt="Logo" width={32} height={32} className="rounded-full" />
                <input
                  type="text"
                  placeholder="Ask Chat Automations to do something..."
                  className="flex-1 bg-transparent text-sm text-neutral-300 placeholder-neutral-600 outline-none"
                  readOnly
                />
                <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-600">
                  <kbd className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700">
                    ⌘
                  </kbd>
                  <kbd className="px-2 py-1 rounded bg-neutral-800 border border-neutral-700">
                    K
                  </kbd>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute inset-0 bg-gradient-to-t from-[#533ccf]/5 via-transparent to-transparent pointer-events-none" />
        </motion.div>

        <div className="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[80%] h-40 bg-[#533ccf]/20 blur-[100px] pointer-events-none" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-60 bg-gradient-to-t from-black via-black/80 to-transparent z-20" />
    </div>
  );
}
