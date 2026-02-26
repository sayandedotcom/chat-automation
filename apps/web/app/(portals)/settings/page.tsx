"use client";

import { Button } from "@workspace/ui/components/button";
import { signOut } from "@/lib/auth-client";

function SettingsPage() {
  const handleSignOut = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-8">Settings</h1>
      <Button onClick={handleSignOut} variant="destructive">
        Sign out
      </Button>
    </div>
  );
}

export default SettingsPage;
