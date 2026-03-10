"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { CTASection } from "@/components/landing/cta-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { HeroSection } from "@/components/landing/hero-section";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteHeader } from "@/components/landing/site-header";
import { SocialProofSection } from "@/components/landing/social-proof-section";

import { useSession } from "@/lib/auth-client";

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
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </main>
    );
  }

  // If authenticated, show spinner while redirect is in progress
  if (session?.user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white selection:bg-purple-500/30">
      <SiteHeader />
      <HeroSection />
      <SocialProofSection />
      <FeaturesSection />
      <CTASection />
      <SiteFooter />
    </main>
  );
}
