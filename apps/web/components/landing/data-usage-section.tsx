"use client";

import Link from "next/link";

import { motion } from "framer-motion";
import { Calendar, Mail, Shield, User } from "lucide-react";

const dataUsage = [
  {
    icon: User,
    title: "Profile Information",
    description:
      "We access your basic profile (name, email, profile photo) to create and personalize your account.",
  },
  {
    icon: Calendar,
    title: "Google Calendar",
    description:
      "Calendar access allows us to schedule meetings, manage your time, and automate calendar-related tasks.",
  },
  {
    icon: Mail,
    title: "Gmail Integration",
    description:
      "Email access enables smart email triage, drafting responses, and organizing your inbox automatically.",
  },
  {
    icon: Shield,
    title: "Your Data, Your Control",
    description:
      "We only access data you explicitly authorize. You can revoke access at any time from your Google account settings.",
  },
];

export function DataUsageSection() {
  return (
    <section className="relative overflow-hidden bg-black py-24 text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black via-[#533ccf]/5 to-black" />

      <div className="relative z-10 container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 flex flex-col items-center text-center">
          <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">
            <span className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
              How We Use Your Data
            </span>
          </h2>
          <p className="max-w-2xl text-lg text-neutral-400">
            Chat Automations integrates with Google services to automate your workflows. Here's what
            data we access and why.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {dataUsage.map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="group rounded-2xl border border-white/10 bg-neutral-900/50 p-6 transition-all hover:border-[#533ccf]/30 hover:bg-neutral-900/80">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#533ccf]/20">
                <item.icon className="h-6 w-6 text-[#533ccf]" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
              <p className="text-sm leading-relaxed text-neutral-400">{item.description}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-12 text-center">
          <p className="text-sm text-neutral-500">
            For complete details on data handling, please read our{" "}
            <Link href="/privacy" className="text-[#533ccf] underline-offset-4 hover:underline">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-[#533ccf] underline-offset-4 hover:underline">
              Terms of Service
            </Link>
            .
          </p>
        </motion.div>
      </div>
    </section>
  );
}
