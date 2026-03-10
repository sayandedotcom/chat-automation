/**
 * Vanilla tRPC client for non-React contexts.
 * Use this for server-side calls, scripts, or non-React applications.
 */
import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "../routers/index.js";

export type { AppRouter };

/**
 * Options for creating a vanilla tRPC client
 */
export interface CreateClientOptions {
  /**
   * Base URL of the tRPC server (e.g., process.env.NEXT_PUBLIC_API_URL + '/trpc')
   */
  url: string;

  /**
   * Optional headers to include with every request
   */
  headers?: () => Record<string, string> | Promise<Record<string, string>>;

  /**
   * Enable request/response logging (default: false in production)
   */
  enableLogging?: boolean;
}

/**
 * Creates a vanilla tRPC client for making API calls.
 *
 * @example
 * ```ts
 * import { createClient } from '@workspace/trpc/client';
 *
 * const client = createClient({ url: `${process.env.NEXT_PUBLIC_API_URL}/trpc` });
 *
 * // Make type-safe API calls
 * const users = await client.users.list.query();
 * ```
 */
export function createClient(options: CreateClientOptions) {
  const links = [];

  // Add logger link in development or when explicitly enabled
  if (options.enableLogging ?? process.env.NODE_ENV === "development") {
    links.push(
      loggerLink({
        enabled: () => true,
      })
    );
  }

  // Add HTTP batch link for efficient request batching
  links.push(
    httpBatchLink({
      url: options.url,
      headers: options.headers,
      transformer: superjson,
    })
  );

  return createTRPCClient<AppRouter>({
    links,
  });
}

/**
 * Type of the vanilla client for custom wrappers
 */
export type TRPCClient = ReturnType<typeof createClient>;
