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
    <footer className="relative pt-32 pb-12 bg-black text-neutral-400 text-sm overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-t from-purple-950/10 to-transparent pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-16">
          <div className="col-span-2">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-xl text-white mb-4"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-violet-600 rounded-lg flex items-center justify-center">
                <span className="text-sm font-bold">CA</span>
              </div>
              Chat Automations
            </Link>
            <p className="mb-6 max-w-xs text-neutral-500 leading-relaxed">
              An AI coworker that works 24/7 to help you focus on what matters
              most.
            </p>
            <div className="flex gap-3">
              {[Twitter, Linkedin, Github].map((Icon, i) => (
                <Link
                  key={i}
                  href="#"
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 transition-all"
                >
                  <Icon className="w-4 h-4 text-neutral-400 hover:text-white transition-colors" />
                </Link>
              ))}
            </div>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h4 className="text-white font-semibold mb-4">{category}</h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link}>
                    <Link
                      href="#"
                      className="hover:text-white transition-colors"
                    >
                      {link}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-neutral-600">
            © {new Date().getFullYear()} Chat Automations Inc. All rights
            reserved.
          </p>
          <div className="flex items-center gap-6 text-neutral-500">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
