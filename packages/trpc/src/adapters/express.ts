/**
 * Express adapter for tRPC.
 * Provides middleware and utilities for integrating tRPC with Express.
 */

import type { Express, Request, Response, NextFunction } from "express";
import {
  createExpressMiddleware as trpcExpressMiddleware,
  type CreateExpressContextOptions,
} from "@trpc/server/adapters/express";
import { appRouter, type AppRouter } from "../routers/index.js";
import { createContext } from "../server/context.js";

export { appRouter, type AppRouter };

/**
 * Create tRPC context from Express request/response
 */
export function createExpressContext({
  req,
  res,
}: CreateExpressContextOptions) {
  return createContext({ req, res });
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
