"use client";

import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
}

export interface AuthStatus {
  authenticated: boolean;
  user: User | null;
}

export interface SessionData {
  user: User;
  session: {
    id: string;
    expiresAt: Date;
  };
}

async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    throw new Error(`Auth error: ${res.status}`);
  }

  return res.json();
}

export const authClient = {
  signInWithGoogle: (callbackURL?: string) => {
    const url = callbackURL
      ? `${API_URL}/auth/google?callbackURL=${encodeURIComponent(callbackURL)}`
      : `${API_URL}/auth/google`;
    window.location.href = url;
  },

  signOut: async (): Promise<{ success: boolean; message: string }> => {
    return fetchJson("/auth/logout", { method: "POST" });
  },

  getStatus: async (): Promise<AuthStatus> => {
    return fetchJson("/auth/status");
  },

  getMe: async (): Promise<{ user: User }> => {
    return fetchJson("/auth/me");
  },
};

export const signIn = {
  social: (options: { provider: "google"; callbackURL?: string }) => {
    if (options.provider === "google") {
      authClient.signInWithGoogle(options.callbackURL);
    }
  },
};

export const { signInWithGoogle, signOut, getStatus, getMe } = authClient;

let sessionCache: { data: SessionData | null; timestamp: number } | null = null;
const CACHE_TTL = 30 * 1000;
const listeners: Set<() => void> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

export function useSession() {
  const [data, setData] = useState<SessionData | null>(
    sessionCache?.data ?? null,
  );
  const [isPending, setIsPending] = useState(!sessionCache);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsPending(true);
    setError(null);
    try {
      const status = await getStatus();
      const sessionData: SessionData | null =
        status.authenticated && status.user
          ? {
              user: status.user,
              session: {
                id: status.user.id,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              },
            }
          : null;
      sessionCache = { data: sessionData, timestamp: Date.now() };
      setData(sessionData);
      notifyListeners();
    } catch (err) {
      setError(err as Error);
      setData(null);
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    const listener = () => {
      if (sessionCache) {
        setData(sessionCache.data);
      }
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (sessionCache && Date.now() - sessionCache.timestamp < CACHE_TTL) {
      setData(sessionCache.data);
      setIsPending(false);
      return;
    }
    refetch();
  }, [refetch]);

  return { data, isPending, error, refetch };
}
