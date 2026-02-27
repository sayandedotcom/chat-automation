"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  Mail,
  FileText,
  Slack,
  Github,
  Trello,
  Zap,
  Shield,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    title: "Smart Calendar Management",
    desc: "Automatically optimize your schedule, block focus time, and handle meeting conflicts intelligently.",
    icon: Calendar,
    gradient: "from-blue-500 to-cyan-500",
    size: "large",
  },
  {
    title: "Email Triage & Drafts",
    desc: "Sort, prioritize, and draft responses to emails automatically.",
    icon: Mail,
    gradient: "from-purple-500 to-pink-500",
    size: "small",
  },
  {
    title: "Document Intelligence",
    desc: "Summarize, extract insights, and generate content from your documents.",
    icon: FileText,
    gradient: "from-orange-500 to-red-500",
    size: "small",
  },
  {
    title: "Slack Integration",
    desc: "Get instant answers and automate responses directly in your Slack channels.",
    icon: Slack,
    gradient: "from-violet-500 to-purple-500",
    size: "medium",
  },
  {
    title: "GitHub Automation",
    desc: "Review PRs, generate summaries, and manage issues automatically.",
    icon: Github,
    gradient: "from-gray-500 to-gray-600",
    size: "medium",
  },
  {
    title: "Task Management",
    desc: "Create, update, and organize tasks across Trello, Asana, and more.",
    icon: Trello,
    gradient: "from-blue-600 to-blue-500",
    size: "small",
  },
];

const stats = [
  { value: "10x", label: "Productivity Boost" },
  { value: "50k+", label: "Tasks Automated" },
  { value: "99.9%", label: "Uptime" },
];

export function FeaturesSection() {
  return (
    <section className="py-32 bg-black text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-purple-950/5 to-black pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col items-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm text-sm text-neutral-300 mb-6">
            <Zap className="w-4 h-4 text-purple-400" />
            <span>Powerful Features</span>
          </div>
          <h2 className="text-4xl md:text-6xl font-bold mb-6 text-center">
            Everything you need,
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-violet-400">
              nothing you don't
            </span>
          </h2>
          <p className="text-neutral-400 text-center max-w-xl text-lg">
            Connect your tools, set your preferences, and let AI handle the
            rest.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-20">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`group relative p-6 md:p-8 rounded-2xl border border-white/10 bg-neutral-900/50 hover:bg-neutral-900/80 transition-all duration-300 cursor-pointer ${
                feature.size === "large" ? "lg:col-span-2 lg:row-span-2" : ""
              } ${feature.size === "medium" ? "lg:col-span-1" : ""}`}
            >
              <div
                className={`absolute top-0 right-0 w-[200px] h-[200px] bg-gradient-to-br ${feature.gradient} opacity-5 rounded-full blur-[60px] group-hover:opacity-15 transition-opacity duration-500 -translate-y-1/2 translate-x-1/2`}
              />

              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 shadow-lg`}
                  >
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>

                  <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">
                    {feature.desc}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-sm text-neutral-500 mt-6 group-hover:text-purple-400 transition-colors">
                  <span>Learn more</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
        >
          {stats.map((stat, i) => (
            <div
              key={i}
              className="relative p-8 rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-900/50 to-black/50 text-center group hover:border-purple-500/30 transition-colors"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-violet-400 mb-2">
                {stat.value}
              </div>
              <div className="text-neutral-400">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black to-transparent pointer-events-none" />
    </section>
  );
}
