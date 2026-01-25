/**
 * Main entry point for @workspace/trpc
 * Re-exports server utilities and types for convenience.
 */

// Server exports
export { createContext } from "./server/context.js";
export type {
  Context,
  BaseContext,
  ExpressContext,
  CreateContextOptions,
  SessionInfo,
} from "./server/context.js";

export {
  router,
  middleware,
  mergeRouters,
  publicProcedure,
  protectedProcedure,
  baseProcedure,
  createCallerFactory,
} from "./server/trpc.js";

// Router exports
export { appRouter } from "./routers/index.js";
export type { AppRouter } from "./routers/index.js";
