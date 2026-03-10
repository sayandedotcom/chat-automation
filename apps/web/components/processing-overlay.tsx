"use client";

import { useState } from "react";
import Image from "next/image";

const PARTICLE_COUNT = 40;

export function ProcessingOverlay({
  providerIcon,
  providerName,
  visible,
}: {
  providerIcon: string;
  providerName: string;
  visible: boolean;
}) {
  // Generate stable random particles on mount
  const [particles] = useState(() =>
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.5 + 0.1,
      duration: Math.random() * 4 + 3,
      delay: Math.random() * 5,
    }))
  );

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center transition-all duration-700 ${
        visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      style={{ background: "#08080a" }}
    >
      {/* Subtle star-field particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-white animate-pulse"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* Central ambient glow */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-[100%] bg-blue-500/[0.03] blur-[120px] pointer-events-none z-0" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-10">
        {/* Icon row: Provider — line — App */}
        <div className="flex items-center gap-2">
          {/* Provider icon */}
          <div className="relative -rotate-[8deg] transition-transform duration-700 hover:-rotate-12 hover:scale-105">
            <div className="relative z-10 w-[88px] h-[88px] rounded-3xl bg-white border border-white/20 flex items-center justify-center shadow-2xl overflow-hidden p-[16px]">
              <div className="relative w-full h-full flex items-center justify-center">
                <Image src={providerIcon} alt={providerName} fill className="object-contain" />
              </div>
            </div>
            {/* Vibrant Provider glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-orange-500 via-pink-500 to-yellow-500 opacity-30 blur-2xl block" />
          </div>

          {/* Animated gently bending connecting line */}
          <div className="relative w-[80px] h-[40px] mx-1 z-0 flex items-center justify-center">
             <svg width="80" height="40" viewBox="0 0 80 40" className="absolute overflow-visible">
                <path
                  id="connection-path"
                  d="M 0 20 Q 40 12 80 20"
                  fill="none"
                  stroke="url(#gradient)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  className="opacity-40"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#ec4899" /> {/* pink-500 */}
                    <stop offset="50%" stopColor="#a855f7" /> {/* purple-500 */}
                    <stop offset="100%" stopColor="#3b82f6" /> {/* blue-500 */}
                  </linearGradient>
                </defs>
                <circle r="4" fill="#ffffff" filter="drop-shadow(0 0 4px #ffffff)">
                  <animateMotion
                    dur="1.5s"
                    repeatCount="indefinite"
                    path="M 0 20 Q 40 12 80 20"
                    calcMode="linear"
                  />
                </circle>
             </svg>
          </div>

          {/* App icon */}
          <div className="relative rotate-[8deg] transition-transform duration-700 hover:rotate-12 hover:scale-105">
            <div className="relative z-10 w-[88px] h-[88px] rounded-3xl bg-[#0a0a0a] border border-white/10 flex items-center justify-center shadow-2xl overflow-hidden p-[16px]">
              <div className="relative w-full h-full flex items-center justify-center">
                <Image src="/logo.png" alt="App" fill className="object-contain" />
              </div>
            </div>
            {/* Vibrant App glow */}
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-blue-600 to-purple-600 opacity-40 blur-2xl block" />
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-2 mt-2">
          <h2 className="text-[22px] font-semibold tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-gray-100 via-gray-300 to-gray-500 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            Processing Integration
          </h2>
          <p className="text-[14px] text-zinc-400 text-center max-w-xs font-medium">
            We&apos;re setting things up for you. Please don&apos;t close this window.
          </p>
        </div>
      </div>

      {/* Adding a custom class for the shining silver text animation if desired later, but static gradient looks great too */}
    </div>
  );
}
