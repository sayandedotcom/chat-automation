"use client";
import { useState } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { motion } from "framer-motion";
import { Zap, Clock, FileText, Image, Box, Shield } from "lucide-react";

const tabs = ["Featured", "Engineering", "Design", "Marketing", "People"];

const features = [
  {
    title: "Deep Work Protection",
    desc: "Automatically declines meetings during your peak productivity hours.",
    category: "Featured",
    color: "from-blue-500 to-cyan-500",
    icon: Shield,
  },
  {
    title: "Smart Rescheduling",
    desc: "Resolves conflicts by negotiating times with participants.",
    category: "Featured",
    color: "from-purple-500 to-pink-500",
    icon: Clock,
  },
  {
    title: "PR Summaries",
    desc: "Generates concise summaries for your pull requests.",
    category: "Engineering",
    color: "from-green-500 to-emerald-500",
    icon: FileText,
  },
  {
    title: "Asset Organization",
    desc: "Tags and organizes design files automatically.",
    category: "Design",
    color: "from-orange-500 to-red-500",
    icon: Image,
  },
];

export function FeaturesSection() {
  const [activeTab, setActiveTab] = useState("Featured");

  return (
    <section className="py-24 bg-black text-white relative z-10">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold mb-6 text-center">
            Your work, on autopilot.
          </h2>
          <p className="text-neutral-400 text-center max-w-xl mb-10">
            Choose from hundreds of pre-built automations or create your own
            with plain English.
          </p>

          <div className="flex flex-wrap justify-center gap-1 p-1 bg-white/5 rounded-full border border-white/10 backdrop-blur-sm">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-6 py-2 rounded-full text-sm font-medium transition-all duration-300",
                  activeTab === tab
                    ? "bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.1)] border border-white/10"
                    : "text-neutral-500 hover:text-neutral-300"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            ...features.filter(
              (f) => f.category === activeTab || f.category === "Featured"
            ),
            ...Array(3).fill({
              title: "Coming Soon",
              desc: "More automations being added daily.",
              color: "from-neutral-700 to-neutral-600",
              icon: Box,
            }),
          ]
            .slice(0, 6)
            .map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="group relative h-[300px] p-8 rounded-3xl border border-white/10 bg-[#0a0a0a] overflow-hidden hover:bg-neutral-900/50 transition-colors"
              >
                <div
                  className={cn(
                    "absolute top-0 right-0 w-[300px] h-[300px] bg-gradient-to-br opacity-10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 group-hover:opacity-20 transition-opacity duration-500",
                    feature.color || "from-neutral-500 to-neutral-500"
                  )}
                />

                <div className="relative z-10 flex flex-col h-full justify-between">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-xl font-bold mb-4",
                      feature.color || "from-neutral-700 to-neutral-800"
                    )}
                  >
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>

                  <div>
                    <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-neutral-400 text-sm leading-relaxed">
                      {feature.desc}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
        </div>
      </div>
    </section>
  );
}
