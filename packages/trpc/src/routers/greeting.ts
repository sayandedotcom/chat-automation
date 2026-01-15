/**
 * Greeting router - example procedures
 */

import { z } from "zod";
import { router, publicProcedure } from "../server/trpc.js";

export const greetingRouter = router({
  /**
   * Simple greeting query
   */
  hello: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(({ input }) => {
      return `compile: Hello ${input.name}!`;
    }),

  /**
   * Get server time - demonstrates Date serialization via SuperJSON
   */
  getServerTime: publicProcedure.query(() => {
    return {
      time: new Date(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }),
});
