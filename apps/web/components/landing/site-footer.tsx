import Link from "next/link";

import { Github, Linkedin, Twitter } from "lucide-react";

const footerLinks = {
  Product: ["Features", "Integrations", "Pricing", "Changelog", "Roadmap"],
  Company: ["About", "Careers", "Blog", "Press", "Contact"],
  Resources: ["Documentation", "API Reference", "Status", "Support"],
  Legal: ["Privacy", "Terms", "Security", "Cookies"],
};

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden bg-black pt-32 pb-12 text-sm text-neutral-400">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#533ccf]/10 to-transparent" />

      <div className="relative z-10 container mx-auto px-6">
        <div className="mb-16 grid grid-cols-2 gap-8 md:grid-cols-6">
          <div className="col-span-2">
            <Link href="/" className="mb-4 flex items-center gap-2 text-xl font-bold">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#533ccf]">
                <span className="text-sm font-bold text-white">CA</span>
              </div>
              <span className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
                Chat Automations
              </span>
            </Link>
            <p className="mb-6 max-w-xs leading-relaxed text-neutral-500">
              An AI coworker that works 24/7 to help you focus on what matters most.
            </p>
            <div className="flex gap-3">
              {[Twitter, Linkedin, Github].map((Icon, i) => (
                <Link
                  key={i}
                  href="#"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 transition-all hover:border-white/20 hover:bg-white/10">
                  <Icon className="h-4 w-4 text-neutral-400 transition-colors hover:text-white" />
                </Link>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="mb-4 font-semibold text-white">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <Link href="#" className="transition-colors hover:text-white">
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/5 pt-8 md:flex-row">
          <p className="text-neutral-600">
            © {new Date().getFullYear()} Chat Automations Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-neutral-500">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
