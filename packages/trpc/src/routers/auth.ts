/**
 * Auth router for session endpoints.
 * Provides type-safe session access via tRPC.
 */

import { router, publicProcedure, protectedProcedure } from "../server/trpc.js";

export const authRouter = router({
  /**
   * Get current session (returns null if not authenticated)
   */
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.session;
  }),

  /**
   * Get current user (throws if not authenticated)
   */
  getUser: protectedProcedure.query(({ ctx }) => {
    return ctx.user;
  }),
});
