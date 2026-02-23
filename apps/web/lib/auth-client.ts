import { createAuthClient } from "better-auth/react";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
});

export const getCallbackUrl = (path: string = "/chat") => `${APP_URL}${path}`;

export const { signIn, signUp, signOut, useSession, getSession } = authClient;
