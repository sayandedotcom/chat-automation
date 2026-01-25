import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
});

// Export commonly used functions
export const { signIn, signOut, useSession, getSession } = authClient;
