"use client";

import { motion } from "framer-motion";
import { Slack, FileText, ListTodo, Figma, Github, Trello } from "lucide-react";

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
    <section className="py-24 bg-black text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-black via-[#533ccf]/10 to-black pointer-events-none" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <p className="bg-clip-text text-transparent bg-gradient-to-b from-neutral-300 to-neutral-500 text-sm uppercase tracking-wider mb-4 font-medium">
            Trusted by teams at
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12">
            {integrations.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-2 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
              >
                <item.icon className="w-6 h-6" />
                <span className="font-medium">{item.name}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20">
          {testimonials.map((testimonial, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
              className="group relative p-8 rounded-2xl border border-white/10 bg-neutral-900/30 hover:bg-neutral-900/50 hover:border-[#533ccf]/20 transition-all duration-300"
            >
              <div className="absolute top-0 right-0 w-[150px] h-[150px] bg-[#533ccf]/5 rounded-full blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity" />

              <div className="relative z-10">
                <p className="text-neutral-300 text-lg leading-relaxed mb-6">
                  "{testimonial.quote}"
                </p>

                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#533ccf] flex items-center justify-center text-sm font-bold">
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
