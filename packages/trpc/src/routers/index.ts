/**
 * Root router combining all sub-routers.
 * This is the main entry point for the tRPC API.
 */

import { router } from "../server/trpc.js";
import { authRouter } from "./auth.js";
import { greetingRouter } from "./greeting.js";
import { conversationRouter } from "./conversation.js";

/**
 * Main application router.
 * Add new routers here as the API grows.
 */
export const appRouter = router({
  auth: authRouter,
  greeting: greetingRouter,
  conversation: conversationRouter,
});

/**
 * Export the router type for client-side type inference.
 * This is the key to end-to-end type safety.
 */
export type AppRouter = typeof appRouter;
