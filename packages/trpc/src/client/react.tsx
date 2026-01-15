"use client";

/**
 * React Query + tRPC integration for Next.js client components.
 * Uses the new @trpc/tanstack-react-query package with createTRPCContext.
 */

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import type { AppRouter } from "../routers/index.js";

/**
 * Create tRPC context with TRPCProvider and hooks.
 * This provides type-safe context providers and consumers.
 */
export const {
  TRPCProvider: TRPCContextProvider,
  useTRPC,
  useTRPCClient,
} = createTRPCContext<AppRouter>();

// Re-export useTRPC as 'trpc' for convenience/backwards compatibility
export const trpc = { useTRPC };

/**
 * Props for TRPCProvider
 */
export interface TRPCProviderProps {
  children: React.ReactNode;
  /**
   * Base URL of the tRPC server
   * @default process.env.NEXT_PUBLIC_API_URL + '/trpc' or 'http://localhost:8000/trpc'
   */
  url?: string;
}

/**
 * Creates default Query Client with production-ready defaults
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Stale time before refetch (1 minute for SSR)
        staleTime: 60 * 1000,
        // Keep unused data in cache for 30 minutes
        gcTime: 30 * 60 * 1000,
        // Refetch on window focus
        refetchOnWindowFocus: true,
      },
      mutations: {
        // Show errors in development
        onError:
          process.env.NODE_ENV === "development"
            ? (error) => console.error("[tRPC Mutation Error]", error)
            : undefined,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: reuse the same query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

/**
 * Provider component for tRPC + React Query.
 * Wrap your application with this to enable tRPC hooks.
 *
 * @example
 * ```tsx
 * // In your layout or _app
 * import { TRPCProvider } from '@workspace/trpc/client/react';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <TRPCProvider url="http://localhost:8000/trpc">
 *       {children}
 *     </TRPCProvider>
 *   );
 * }
 * ```
 */
export function TRPCProvider({ children, url }: TRPCProviderProps) {
  const baseUrl =
    url ??
    (typeof window !== "undefined"
      ? `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/trpc`
      : "http://localhost:8000/trpc");

  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: baseUrl,
          transformer: superjson,
          // Include credentials for cookie-based auth
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: "include",
            });
          },
        }),
      ],
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCContextProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCContextProvider>
    </QueryClientProvider>
  );
}

/**
 * Re-export types for convenience
 */
export type { AppRouter };
