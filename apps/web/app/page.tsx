import { SiteHeader } from "@/components/landing/site-header";
import { HeroSection } from "@/components/landing/hero-section";
import { FeaturesSection } from "@/components/landing/features-section";
import { SiteFooter } from "@/components/landing/site-footer";

export default function Page() {
  return (
    <main className="min-h-screen bg-black text-white selection:bg-purple-500/30">
      <SiteHeader />
      <HeroSection />
      <FeaturesSection />
      <SiteFooter />
    </main>
  );
}
