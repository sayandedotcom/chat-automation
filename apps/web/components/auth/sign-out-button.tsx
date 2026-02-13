"use client";

import { signOut } from "@/lib/auth-client";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@workspace/ui/components/button";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return null;
  }

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
      },
    });
  };

  return (
    <Button onClick={handleSignOut} variant="destructive" size="sm">
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
