"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { SiteHeader } from "@/components/landing/site-header";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { SiteFooter } from "@/components/landing/site-footer";

export default function Page() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && session?.user) {
      router.replace("/chat");
    }
  }, [isPending, session, router]);

  // While checking auth, show a minimal loading state
  if (isPending) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </main>
    );
  }

  // If authenticated, don't render — redirect is in progress
  if (session?.user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-black text-white selection:bg-purple-500/30">
      <SiteHeader />
      <HeroSection />
      <FeaturesSection />
      <SiteFooter />
    </main>
  );
}
