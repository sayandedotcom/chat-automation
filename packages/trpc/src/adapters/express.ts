/**
 * Express adapter for tRPC.
 * Provides middleware and utilities for integrating tRPC with Express.
 */

import type { Express, Request } from "express";
import {
  createExpressMiddleware as trpcExpressMiddleware,
  type CreateExpressContextOptions,
} from "@trpc/server/adapters/express";
import { appRouter, type AppRouter } from "../routers/index.js";
import { createContext, type SessionInfo } from "../server/context.js";

export { appRouter, type AppRouter };

/**
 * Session getter function type
 */
type SessionGetter = (req: Request) => Promise<SessionInfo>;

/**
 * Session getter function - set by the API app
 */
let sessionGetter: SessionGetter | null = null;

/**
 * Set the session getter function.
 * Call this from your Express app to inject Better Auth session into tRPC context.
 */
export function setSessionGetter(fn: SessionGetter) {
  sessionGetter = fn;
}

/**
 * Create tRPC context from Express request/response
 */
export async function createExpressContext({
  req,
  res,
}: CreateExpressContextOptions) {
  let session: SessionInfo = { user: null, session: null };

  if (sessionGetter) {
    try {
      session = await sessionGetter(req);
    } catch (error) {
      console.error("[tRPC] Failed to get session:", error);
    }
  }

  return createContext({ req, res, session });
}

/**
 * Creates the tRPC Express middleware.
 * Mount this on your Express app at a specific path (e.g., '/trpc').
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createTRPCMiddleware } from '@workspace/trpc/adapters/express';
 *
 * const app = express();
 * app.use('/trpc', createTRPCMiddleware());
 * ```
 */
export function createTRPCMiddleware() {
  return trpcExpressMiddleware({
    router: appRouter,
    createContext: createExpressContext,
    onError: ({ error, path }) => {
      console.error(`[tRPC Error] ${path}:`, error.message);
    },
  });
}

/**
 * Convenience function to mount tRPC on an Express app.
 *
 * @param app - Express application instance
 * @param path - Path to mount tRPC on (default: '/trpc')
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { mountTRPC } from '@workspace/trpc/adapters/express';
 *
 * const app = express();
 * mountTRPC(app);
 * // or with custom path
 * mountTRPC(app, '/api/trpc');
 * ```
 */
export function mountTRPC(app: Express, path: string = "/trpc") {
  app.use(path, createTRPCMiddleware());
  console.log(`[tRPC] Mounted at ${path}`);
}
