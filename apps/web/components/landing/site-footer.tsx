import { Github, Linkedin, Twitter } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="py-20 bg-black border-t border-white/10 text-neutral-400 text-sm">
      <div className="container mx-auto px-6 grid grid-cols-2 md:grid-cols-5 gap-12">
        <div className="col-span-2">
          <h3 className="text-white font-bold text-xl mb-4">
            Chat Automations
          </h3>
          <p className="mb-6 max-w-xs">
            An AI coworker that works 24/7 to help you focus on what matters.
          </p>
          <p>© 2026 Chat Automations Inc.</p>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-4">Product</h4>
          <ul className="space-y-3">
            <li className="hover:text-white cursor-pointer transition-colors">
              Features
            </li>
            <li className="hover:text-white cursor-pointer transition-colors">
              Integrations
            </li>
            <li className="hover:text-white cursor-pointer transition-colors">
              Pricing
            </li>
            <li className="hover:text-white cursor-pointer transition-colors">
              Changelog
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-4">Company</h4>
          <ul className="space-y-3">
            <li className="hover:text-white cursor-pointer transition-colors">
              About
            </li>
            <li className="hover:text-white cursor-pointer transition-colors">
              Careers
            </li>
            <li className="hover:text-white cursor-pointer transition-colors">
              Blog
            </li>
            <li className="hover:text-white cursor-pointer transition-colors">
              Contact
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-semibold mb-4">Legal</h4>
          <ul className="space-y-3">
            <li className="hover:text-white cursor-pointer transition-colors">
              Privacy
            </li>
            <li className="hover:text-white cursor-pointer transition-colors">
              Terms
            </li>
            <li className="hover:text-white cursor-pointer transition-colors">
              Security
            </li>
          </ul>
        </div>
      </div>

      <div className="container mx-auto px-6 mt-20 pt-8 border-t border-white/5 flex items-center justify-between">
        <div className="flex gap-4">
          <div className="p-2 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 cursor-pointer transition-colors">
            <Twitter className="w-4 h-4 text-white" />
          </div>
          <div className="p-2 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 cursor-pointer transition-colors">
            <Linkedin className="w-4 h-4 text-white" />
          </div>
          <div className="p-2 bg-white/5 rounded-full flex items-center justify-center hover:bg-white/10 cursor-pointer transition-colors">
            <Github className="w-4 h-4 text-white" />
          </div>
        </div>
        <div className="text-xs text-neutral-600">
          Made with ♥ in San Francisco
        </div>
      </div>
    </footer>
  );
}
