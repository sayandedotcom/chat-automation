import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
});

// Export commonly used functions
export const { signIn, signUp, signOut, useSession, getSession } = authClient;
