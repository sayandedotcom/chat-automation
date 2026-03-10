"use client";

import { motion } from "framer-motion";

import { Button } from "@workspace/ui/components/button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function CTASection() {
  return (
    <section className="relative flex justify-center overflow-hidden bg-black px-4 py-24">
      {/* Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative flex h-[500px] w-full max-w-[1200px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-[#060608] shadow-2xl">
        {/* Deep background glow */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-[800px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-900/10 blur-[100px]" />

        {/* Diagonal Streaks resembling warp speed */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-40">
          {/* Top border glowing streaks */}
          <div className="absolute top-[20%] left-[-10%] h-[1px] w-[40%] rotate-[15deg] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
          <div className="absolute top-[10%] right-[-5%] h-[1px] w-[30%] -rotate-[20deg] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

          {/* Radial space lines */}
          <div className="absolute top-[-20%] left-[20%] h-[60%] w-[1px] rotate-[40deg] bg-gradient-to-b from-transparent via-white/50 to-transparent" />
          <div className="absolute top-[0%] left-[30%] h-[40%] w-[1px] rotate-[55deg] bg-gradient-to-b from-transparent via-white/30 to-transparent" />

          <div className="absolute top-[-20%] right-[20%] h-[60%] w-[1px] -rotate-[40deg] bg-gradient-to-b from-transparent via-indigo-300/40 to-transparent" />
          <div className="absolute top-[0%] right-[30%] h-[40%] w-[1px] -rotate-[55deg] bg-gradient-to-b from-transparent via-white/20 to-transparent" />

          <div className="absolute top-[40%] right-[10%] h-[1px] w-[15%] -rotate-12 bg-gradient-to-l from-transparent via-blue-400/30 to-transparent" />
          <div className="absolute top-[45%] left-[5%] h-[1px] w-[15%] rotate-12 bg-gradient-to-r from-transparent via-indigo-400/20 to-transparent" />
        </div>

        {/* Dust/Stars */}
        <div className="absolute inset-0 bg-[radial-gradient(1px_1px_at_20%_30%,rgba(255,255,255,0.4),transparent),radial-gradient(1px_1px_at_80%_40%,rgba(255,255,255,0.4),transparent),radial-gradient(1.5px_1.5px_at_60%_20%,rgba(255,255,255,0.5),transparent)] bg-[length:200px_200px]" />

        {/* Planet/Horizon Effect */}
        <div className="absolute -bottom-[500px] left-1/2 h-[700px] w-[1000px] -translate-x-1/2 rounded-[100%] border-t-[2px] border-indigo-400/30 bg-[#0A0A0E] shadow-[0_-40px_100px_rgba(99,102,241,0.15)] md:-bottom-[700px] md:h-[1000px] md:w-[1600px]">
          {/* Inner glows for volume */}
          <div className="absolute top-0 left-1/2 h-32 w-[70%] -translate-x-1/2 rounded-t-[100%] bg-gradient-to-b from-indigo-500/10 to-transparent blur-2xl" />

          {/* Wireframe lines simulating planet curvature */}
          <div className="absolute -top-[15px] left-1/2 h-[650px] w-[850px] -translate-x-1/2 rounded-[100%] border-t border-indigo-300/10 md:h-[950px] md:w-[1400px]" />
          <div className="absolute -top-[30px] left-1/2 h-[600px] w-[700px] -translate-x-1/2 rounded-[100%] border-t border-indigo-300/5 md:h-[900px] md:w-[1200px]" />
        </div>

        {/* Extra Vertical/Radial curve lines on the planet */}
        <div className="pointer-events-none absolute bottom-[-50px] left-1/2 z-0 h-[250px] w-[1000px] -translate-x-1/2 overflow-hidden opacity-20">
          <div className="absolute -bottom-[250px] left-[50%] h-[500px] w-[1200px] -translate-x-1/2 rounded-[100%] border-x border-white/30" />
          <div className="absolute -bottom-[250px] left-[50%] h-[500px] w-[900px] -translate-x-1/2 rounded-[100%] border-x border-white/20" />
          <div className="absolute -bottom-[250px] left-[50%] h-[500px] w-[600px] -translate-x-1/2 rounded-[100%] border-x border-white/20" />
          <div className="absolute -bottom-[250px] left-[50%] h-[500px] w-[300px] -translate-x-1/2 rounded-[100%] border-x border-white/20" />
          <div className="absolute -bottom-[250px] left-[50%] h-[500px] w-[1px] -translate-x-1/2 bg-white/20" />
        </div>

        {/* Content */}
        <div className="relative z-10 mt-8 mb-16 flex flex-col items-center gap-6 px-4 text-center">
          <h2 className="text-4xl font-medium tracking-tight md:text-5xl lg:text-5xl">
            <span className="bg-gradient-to-b from-white via-neutral-300 to-neutral-500 bg-clip-text text-transparent">
              Meet your new coworker.
            </span>
          </h2>

          <a href={`${API_URL}/auth/google`}>
            <Button className="gap-2 rounded-full bg-[#533ccf] px-5 text-white hover:bg-[#533ccf]">
              <svg className="h-4 w-4" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                <path
                  fill="#FFC107"
                  d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                />
              </svg>
              Get Started
            </Button>
          </a>
        </div>
      </motion.div>
    </section>
  );
}
