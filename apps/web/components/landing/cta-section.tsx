"use client";

import { motion } from "framer-motion";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight, Sparkles } from "lucide-react";

export function CTASection() {
  return (
    <section className="relative py-32 bg-black overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-purple-950/20 to-black pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/20 rounded-full blur-[150px] pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm text-sm text-neutral-300 mb-8">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Start your free trial today</span>
          </div>

          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            Ready to transform
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-violet-400 to-purple-400">
              how you work?
            </span>
          </h2>

          <p className="text-lg text-neutral-400 mb-10 max-w-xl mx-auto">
            Join thousands of teams already using Chat Automations to save time
            and focus on what matters.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button className="group rounded-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-500 hover:to-violet-500 transition-all px-10 py-7 text-lg shadow-[0_0_60px_rgba(139,92,246,0.3)] border border-white/10 hover:shadow-[0_0_80px_rgba(139,92,246,0.4)]">
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              variant="outline"
              className="rounded-full border-white/10 bg-white/5 hover:bg-white/10 transition-all px-10 py-7 text-lg text-white"
            >
              Talk to Sales
            </Button>
          </div>

          <p className="mt-8 text-sm text-neutral-500">
            No credit card required · Free 14-day trial · Cancel anytime
          </p>
        </motion.div>
      </div>
    </section>
  );
}
