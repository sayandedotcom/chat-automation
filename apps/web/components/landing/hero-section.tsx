"use client";

import { useRef } from "react";

import Image from "next/image";

import { motion } from "framer-motion";

import { ShootingStars } from "@workspace/ui/components/shooting-stars";
import { StarsBackground } from "@workspace/ui/components/stars-background";

export function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-[140vh] w-full flex-col items-center justify-start overflow-hidden bg-black pt-32 text-white md:pt-44">
      <div className="absolute inset-0 top-0 z-0 h-screen">
        <StarsBackground className="h-full" starDensity={0.00015} />
        <ShootingStars />
      </div>

      <div className="pointer-events-none absolute top-0 left-1/2 h-[800px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#533ccf]/20 via-[#533ccf]/10 to-transparent blur-[120px]" />
      <div className="pointer-events-none absolute top-20 right-0 h-[600px] w-[600px] rounded-full bg-blue-600/10 blur-[100px]" />
      <div className="pointer-events-none absolute top-40 left-0 h-[500px] w-[500px] rounded-full bg-[#533ccf]/10 blur-[100px]" />

      <div className="z-10 flex max-w-5xl flex-col items-center gap-6 px-4 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-2xl leading-[1.1] font-medium tracking-tight md:text-4xl lg:text-5xl">
          <span className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
            AI that actually
          </span>
          <br />
          <span className="bg-gradient-to-b from-neutral-300 to-neutral-500 bg-clip-text text-transparent">
            works for you.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-2xl text-sm leading-relaxed text-neutral-400">
          An intelligent assistant that understands you, your team, and your tools.
          <br className="hidden md:block" />
          Automate the mundane. Focus on what matters.
        </motion.p>
      </div>

      <div className="z-20 mt-16 w-full max-w-6xl px-4 [perspective:2000px] md:mt-24">
        <motion.div
          initial={{ rotateX: 25, opacity: 0, y: 100 }}
          animate={{ rotateX: 0, opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-900/80 to-black/90 shadow-2xl backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#533ccf]/5 via-transparent to-blue-500/5" />

          <div className="flex items-center gap-2 border-b border-white/5 bg-white/[0.02] px-4 py-4">
            <div className="h-3 w-3 rounded-full bg-[#FF5F56]" />
            <div className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
            <div className="h-3 w-3 rounded-full bg-[#27C93F]" />
            <div className="ml-4 flex items-center gap-2 text-xs font-medium text-neutral-500">
              <Image src="/logo.png" alt="Logo" width={16} height={16} className="rounded" />
              Chat Automations
            </div>
            <div className="ml-auto flex items-center gap-4 text-xs text-neutral-600">
              <span>⌘K</span>
            </div>
          </div>

          <div className="relative flex h-[450px] flex-col gap-5 p-4 md:h-[550px] md:p-6">
            <div className="flex max-w-lg items-start gap-4 self-end">
              <div className="rounded-2xl rounded-tr-sm border border-white/5 bg-neutral-800/80 p-4 text-sm text-neutral-200">
                <p>
                  Clear my calendar for the rest of the week and reschedule the important meetings
                  to next week.
                </p>
              </div>
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-neutral-600 to-neutral-700 text-xs font-medium">
                U
              </div>
            </div>

            <div className="flex max-w-2xl items-start gap-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full shadow-[0_0_20px_rgba(83,60,207,0.3)]">
                <Image src="/logo.png" alt="Logo" width={36} height={36} className="rounded-full" />
              </div>
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl rounded-tl-sm border border-[#533ccf]/20 bg-[#533ccf]/10 p-5 text-sm text-neutral-200 shadow-[0_0_40px_rgba(83,60,207,0.1)]">
                  <p className="mb-4">
                    I've analyzed your calendar and identified 5 meetings. I recommend canceling 3
                    low-priority syncs and rescheduling 2 important meetings to next week.
                  </p>

                  <div className="overflow-hidden rounded-xl border border-white/5 bg-black/50">
                    <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] p-3">
                      <span className="text-xs font-semibold text-neutral-300">
                        Calendar Actions
                      </span>
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        6h freed
                      </span>
                    </div>
                    <div className="flex flex-col gap-2 p-3">
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
                          className="flex cursor-pointer items-center gap-3 rounded-lg p-2 text-xs text-neutral-400 transition-colors hover:bg-white/5">
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                              item.color === "red"
                                ? "border-red-500/50 text-red-400"
                                : "border-emerald-500/50 text-emerald-400"
                            }`}>
                            {item.icon}
                          </div>
                          <span
                            className={
                              item.color === "red"
                                ? "text-neutral-500 line-through"
                                : "text-neutral-300"
                            }>
                            {item.name}
                          </span>
                          <span className="ml-auto text-neutral-500">{item.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="ml-2 flex items-center gap-2 text-xs text-neutral-500">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#533ccf]" />
                  <span>Completed in 2.3s</span>
                </div>
              </div>
            </div>

            <div className="absolute right-0 bottom-4 left-0 px-4 md:px-6">
              <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-neutral-900/80 p-3">
                <Image src="/logo.png" alt="Logo" width={32} height={32} className="rounded-full" />
                <input
                  type="text"
                  placeholder="Ask Chat Automations to do something..."
                  className="flex-1 bg-transparent text-sm text-neutral-300 placeholder-neutral-600 outline-none"
                  readOnly
                />
                <div className="hidden items-center gap-2 text-xs text-neutral-600 sm:flex">
                  <kbd className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1">
                    ⌘
                  </kbd>
                  <kbd className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1">
                    K
                  </kbd>
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#533ccf]/5 via-transparent to-transparent" />
        </motion.div>

        <div className="pointer-events-none absolute -bottom-20 left-1/2 h-40 w-[80%] -translate-x-1/2 bg-[#533ccf]/20 blur-[100px]" />
      </div>

      <div className="absolute right-0 bottom-0 left-0 z-20 h-60 bg-gradient-to-t from-black via-black/80 to-transparent" />
    </div>
  );
}
