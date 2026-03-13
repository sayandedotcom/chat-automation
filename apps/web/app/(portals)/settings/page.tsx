"use client";

import { Button } from "@workspace/ui/components/button";

import { signOut } from "@/lib/auth-client";

function SettingsPage() {
  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  // Wrapper that conditionally shows background or solid black
  const ContentWrapper = ({ children }: { children: React.ReactNode }) => {
    // Show planetary background when idle
    return (
      <div className="m-2 flex h-[calc(100vh-1rem)] w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#131313]">
        {children}
      </div>
    );
  };

  return (
    <ContentWrapper>
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 py-20 lg:px-12">
        <h1 className="mb-8 text-2xl font-bold">Settings</h1>
        <button
          onClick={handleSignOut}
          className="bubble rounded-full bg-red-500/80 px-6 py-2.5 text-sm font-bold text-red-100 backdrop-blur-md transition-all hover:scale-105 focus:ring-2 focus:ring-red-500/50 focus:outline-none disabled:opacity-50">
          Sign out
        </button>
      </div>
    </ContentWrapper>
  );
}

export default SettingsPage;
