"use client";

import { motion } from "framer-motion";
import { ArrowRight, Calendar, FileText, Github, Mail, Slack, Trello, Zap } from "lucide-react";

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
    gradient: "from-blue-500 to-indigo-500",
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
    gradient: "from-indigo-500 to-blue-500",
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
    <section className="relative overflow-hidden bg-black py-32 text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black via-[#533ccf]/5 to-black" />

      <div className="relative z-10 container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-20 flex flex-col items-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 backdrop-blur-sm">
            <Zap className="h-4 w-4 text-[#533ccf]" />
            <span>Powerful Features</span>
          </div>
          <h2 className="mb-6 text-center text-4xl font-bold tracking-tight md:text-6xl">
            <span className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
              Everything you need,
            </span>
            <br />
            <span className="bg-gradient-to-b from-neutral-300 to-neutral-500 bg-clip-text text-transparent">
              nothing you don't
            </span>
          </h2>
          <p className="max-w-xl text-center text-lg text-neutral-400">
            Connect your tools, set your preferences, and let AI handle the rest.
          </p>
        </motion.div>

        <div className="mb-20 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`group relative cursor-pointer rounded-2xl border border-white/10 bg-neutral-900/50 p-6 transition-all duration-300 hover:bg-neutral-900/80 md:p-8 ${
                feature.size === "large" ? "lg:col-span-2 lg:row-span-2" : ""
              } ${feature.size === "medium" ? "lg:col-span-1" : ""}`}>
              <div
                className={`absolute top-0 right-0 h-[200px] w-[200px] bg-gradient-to-br ${feature.gradient} translate-x-1/2 -translate-y-1/2 rounded-full opacity-5 blur-[60px] transition-opacity duration-500 group-hover:opacity-15`}
              />

              <div className="relative z-10 flex h-full flex-col justify-between">
                <div>
                  <div
                    className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feature.gradient} mb-5 flex items-center justify-center shadow-lg`}>
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>

                  <h3 className="mb-3 text-xl font-bold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-neutral-400">{feature.desc}</p>
                </div>

                <div className="mt-6 flex items-center gap-2 text-sm text-neutral-500 transition-colors group-hover:text-[#533ccf]">
                  <span>Learn more</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="group relative rounded-2xl border border-white/10 bg-gradient-to-b from-neutral-900/50 to-black/50 p-8 text-center transition-colors hover:border-[#533ccf]/30">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-[#533ccf]/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <div className="mb-2 bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-4xl font-bold text-transparent md:text-5xl">
                {stat.value}
              </div>
              <div className="text-neutral-400">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>

      <div className="pointer-events-none absolute right-0 bottom-0 left-0 h-40 bg-gradient-to-t from-black to-transparent" />
    </section>
  );
}
