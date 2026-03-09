"use client";

import { Button } from "@workspace/ui/components/button";
import { motion } from "framer-motion";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function CTASection() {
  return (
    <section className="py-24 relative overflow-hidden bg-black flex justify-center px-4">
      {/* Container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative w-full max-w-[1200px] h-[500px] rounded-3xl border border-white/10 bg-[#060608] overflow-hidden flex flex-col items-center justify-center shadow-2xl"
      >
        {/* Deep background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-900/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Diagonal Streaks resembling warp speed */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
          {/* Top border glowing streaks */}
          <div className="absolute top-[20%] left-[-10%] w-[40%] h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent rotate-[15deg]" />
          <div className="absolute top-[10%] right-[-5%] w-[30%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent -rotate-[20deg]" />

          {/* Radial space lines */}
          <div className="absolute top-[-20%] left-[20%] w-[1px] h-[60%] bg-gradient-to-b from-transparent via-white/50 to-transparent rotate-[40deg]" />
          <div className="absolute top-[0%] left-[30%] w-[1px] h-[40%] bg-gradient-to-b from-transparent via-white/30 to-transparent rotate-[55deg]" />

          <div className="absolute top-[-20%] right-[20%] w-[1px] h-[60%] bg-gradient-to-b from-transparent via-indigo-300/40 to-transparent -rotate-[40deg]" />
          <div className="absolute top-[0%] right-[30%] w-[1px] h-[40%] bg-gradient-to-b from-transparent via-white/20 to-transparent -rotate-[55deg]" />

          <div className="absolute top-[40%] right-[10%] w-[15%] h-[1px] bg-gradient-to-l from-transparent via-blue-400/30 to-transparent -rotate-12" />
          <div className="absolute top-[45%] left-[5%] w-[15%] h-[1px] bg-gradient-to-r from-transparent via-indigo-400/20 to-transparent rotate-12" />
        </div>

        {/* Dust/Stars */}
        <div className="absolute inset-0 bg-[radial-gradient(1px_1px_at_20%_30%,rgba(255,255,255,0.4),transparent),radial-gradient(1px_1px_at_80%_40%,rgba(255,255,255,0.4),transparent),radial-gradient(1.5px_1.5px_at_60%_20%,rgba(255,255,255,0.5),transparent)] bg-[length:200px_200px]" />

        {/* Planet/Horizon Effect */}
        <div className="absolute -bottom-[500px] md:-bottom-[700px] left-1/2 -translate-x-1/2 w-[1000px] md:w-[1600px] h-[700px] md:h-[1000px] rounded-[100%] border-t-[2px] border-indigo-400/30 bg-[#0A0A0E] shadow-[0_-40px_100px_rgba(99,102,241,0.15)]">
          {/* Inner glows for volume */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-32 bg-gradient-to-b from-indigo-500/10 to-transparent rounded-t-[100%] blur-2xl" />

          {/* Wireframe lines simulating planet curvature */}
          <div className="absolute -top-[15px] left-1/2 -translate-x-1/2 w-[850px] md:w-[1400px] h-[650px] md:h-[950px] rounded-[100%] border-t border-indigo-300/10" />
          <div className="absolute -top-[30px] left-1/2 -translate-x-1/2 w-[700px] md:w-[1200px] h-[600px] md:h-[900px] rounded-[100%] border-t border-indigo-300/5" />
        </div>

        {/* Extra Vertical/Radial curve lines on the planet */}
        <div className="absolute bottom-[-50px] left-1/2 -translate-x-1/2 w-[1000px] h-[250px] overflow-hidden pointer-events-none opacity-20 z-0">
          <div className="absolute -bottom-[250px] left-[50%] -translate-x-1/2 w-[1200px] h-[500px] border-x border-white/30 rounded-[100%]" />
          <div className="absolute -bottom-[250px] left-[50%] -translate-x-1/2 w-[900px] h-[500px] border-x border-white/20 rounded-[100%]" />
          <div className="absolute -bottom-[250px] left-[50%] -translate-x-1/2 w-[600px] h-[500px] border-x border-white/20 rounded-[100%]" />
          <div className="absolute -bottom-[250px] left-[50%] -translate-x-1/2 w-[300px] h-[500px] border-x border-white/20 rounded-[100%]" />
          <div className="absolute -bottom-[250px] left-[50%] -translate-x-1/2 w-[1px] h-[500px] bg-white/20" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center px-4 gap-6 mb-16 mt-8">
          <h2 className="text-4xl md:text-5xl lg:text-5xl font-medium tracking-tight">
            <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-neutral-300 to-neutral-500">
              Meet your new coworker.
            </span>
          </h2>

          <a href={`${API_URL}/auth/google`}>
            <Button className="bg-[#533ccf] text-white rounded-full px-5 gap-2 hover:bg-[#533ccf]">
              <svg className="w-4 h-4" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
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
