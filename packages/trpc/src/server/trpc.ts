/**
 * Core tRPC initialization with production-ready configuration.
 * This file sets up the tRPC instance with:
 * - Type-safe context
 * - SuperJSON transformer for dates, maps, sets, etc.
 * - Custom error formatting
 * - Base procedures with middleware
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "./context.js";

/**
 * Initialize tRPC with context and superjson transformer.
 * SuperJSON allows serialization of dates, Maps, Sets, etc.
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Add stack trace only in development
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
    };
  },
});

/**
 * Export reusable router and middleware creators.
 */
export const router = t.router;
export const middleware = t.middleware;
export const mergeRouters = t.mergeRouters;

/**
 * Logging middleware - logs all procedure calls
 */
const loggerMiddleware = t.middleware(async ({ path, type, next, ctx }) => {
  const start = Date.now();

  const result = await next();

  const duration = Date.now() - start;
  const status = result.ok ? "OK" : "ERROR";

  console.log(
    `[tRPC] ${type.toUpperCase()} ${path} - ${status} (${duration}ms) [${ctx.requestId}]`,
  );

  return result;
});

/**
 * Public procedure - accessible by anyone.
 * Includes logging middleware.
 */
export const publicProcedure = t.procedure.use(loggerMiddleware);

/**
 * Auth middleware - ensures user is authenticated
 */
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    });
  }

  return next({
    ctx: {
      ...ctx,
      // Narrow the type to ensure user and session are defined
      user: ctx.session.user,
      session: ctx.session.session!,
    },
  });
});

/**
 * Protected procedure - requires authentication.
 * Use this for any endpoints that need a logged-in user.
 */
export const protectedProcedure = publicProcedure.use(authMiddleware);

/**
 * Create a caller for server-side usage.
 * Useful for calling tRPC procedures from within the server.
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * Export the raw procedure for custom middleware chains
 */
export const baseProcedure = t.procedure;
