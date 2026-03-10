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
      <div className="h-[calc(100vh-1rem)] m-2 w-[calc(100%-1rem)] bg-[#131313] flex flex-col overflow-hidden border border-white/10 rounded-2xl">
        {children}
      </div>
    );
  };

  return (
    <ContentWrapper>
      <div className="max-w-[1400px] w-full mx-auto px-6 lg:px-12 py-20 relative z-10">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>
        <Button onClick={handleSignOut} variant="destructive">
          Sign out
        </Button>
      </div>
    </ContentWrapper>
  );
}

export default SettingsPage;
