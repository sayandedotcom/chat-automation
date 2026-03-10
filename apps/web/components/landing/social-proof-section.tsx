"use client";

import { motion } from "framer-motion";
import { Figma, FileText, Github, ListTodo, Slack, Trello } from "lucide-react";

const integrations = [
  { name: "Slack", icon: Slack },
  { name: "Notion", icon: FileText },
  { name: "Linear", icon: ListTodo },
  { name: "Figma", icon: Figma },
  { name: "GitHub", icon: Github },
  { name: "Trello", icon: Trello },
];

const testimonials = [
  {
    quote: "Chat Automations saved our team 15 hours per week on meeting coordination alone.",
    author: "Sarah Chen",
    role: "Engineering Manager",
    company: "TechCorp",
    avatar: "SC",
  },
  {
    quote:
      "The AI understands context better than any other tool we've tried. It's like having a brilliant assistant.",
    author: "Marcus Johnson",
    role: "CEO",
    company: "StartupXYZ",
    avatar: "MJ",
  },
  {
    quote: "We automated 80% of our routine tasks within the first week. Incredible ROI.",
    author: "Emily Rodriguez",
    role: "Operations Lead",
    company: "ScaleUp Inc",
    avatar: "ER",
  },
];

export function SocialProofSection() {
  return (
    <section className="relative overflow-hidden bg-black py-24 text-white">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black via-[#533ccf]/10 to-black" />

      <div className="relative z-10 container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center">
          <p className="mb-4 bg-gradient-to-b from-neutral-300 to-neutral-500 bg-clip-text text-sm font-medium tracking-wider text-transparent uppercase">
            Trusted by teams at
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {integrations.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex cursor-pointer items-center gap-2 text-neutral-500 transition-colors hover:text-neutral-300">
                <item.icon className="h-6 w-6" />
                <span className="font-medium">{item.name}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="mt-20 grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="group relative rounded-2xl border border-white/10 bg-neutral-900/30 p-8 transition-all duration-300 hover:border-[#533ccf]/20 hover:bg-neutral-900/50">
              <div className="absolute top-0 right-0 h-[150px] w-[150px] rounded-full bg-[#533ccf]/5 opacity-0 blur-[50px] transition-opacity group-hover:opacity-100" />

              <div className="relative z-10">
                <p className="mb-6 text-lg leading-relaxed text-neutral-300">
                  "{testimonial.quote}"
                </p>

                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#533ccf] text-sm font-bold">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{testimonial.author}</div>
                    <div className="text-sm text-neutral-500">
                      {testimonial.role} at {testimonial.company}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
