import Link from "next/link";
import { Button } from "@workspace/ui/components/button";

export function SiteHeader() {
  return (
    <header className="fixed top-0 w-full z-50 border-b border-white/5 bg-black/30 backdrop-blur-md supports-[backdrop-filter]:bg-black/10">
      <div className="container mx-auto flex h-16 items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl text-white"
        >
          <div className="w-6 h-6 bg-gradient-to-br from-white to-neutral-400 rounded-full" />
          Chat Automations
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
          <Link href="#" className="hover:text-white transition-colors">
            Product
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            Method
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            Customers
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="#"
            className="text-sm font-medium text-white hover:text-neutral-300 hidden md:block"
          >
            Log in
          </Link>
          <Button
            size="sm"
            className="rounded-full bg-white text-black hover:bg-neutral-200 px-5 font-medium"
          >
            Get Started
          </Button>
        </div>
      </div>
    </header>
  );
}
