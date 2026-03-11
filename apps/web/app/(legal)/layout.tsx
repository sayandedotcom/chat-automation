import Link from "next/link";

import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-purple-500/30">
      <SiteHeader />
      <div className="container mx-auto max-w-4xl px-6 py-32">
        <nav className="mb-8 flex gap-4 text-sm">
          <Link href="/privacy" className="text-neutral-400 hover:text-white">
            Privacy Policy
          </Link>
          <span className="text-neutral-600">|</span>
          <Link href="/terms" className="text-neutral-400 hover:text-white">
            Terms of Service
          </Link>
        </nav>
        {children}
      </div>
      <SiteFooter />
    </main>
  );
}
