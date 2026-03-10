import { TRPCError } from "@trpc/server";
import { z } from "zod";

import type { ExpressContext } from "../server/context.js";
import { middleware, publicProcedure, router } from "../server/trpc.js";

const requiresExpressContext = middleware(({ ctx, next }) => {
  if (!("req" in ctx)) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "This procedure requires an Express context",
    });
  }
  return next({ ctx: ctx as ExpressContext });
});

const expressProcedure = publicProcedure.use(requiresExpressContext);

const ACCESS_COOKIES: Record<string, string> = {
  gmail: "gmail_access_token",
  "google-docs": "google_docs_access_token",
  "google-sheets": "google_sheets_access_token",
  "google-slides": "google_slides_access_token",
  "google-drive": "google_drive_access_token",
  "google-calendar": "google_calendar_access_token",
  vercel: "vercel_access_token",
  notion: "notion_access_token",
};

const REFRESH_COOKIES: Record<string, string> = {
  gmail: "gmail_refresh_token",
  "google-docs": "google_docs_refresh_token",
  "google-sheets": "google_sheets_refresh_token",
  "google-slides": "google_slides_refresh_token",
  "google-drive": "google_drive_refresh_token",
  "google-calendar": "google_calendar_refresh_token",
};

export const integrationsRouter = router({
  status: expressProcedure.query(({ ctx }) => {
    const status: Record<string, boolean> = {};
    for (const [provider, cookieName] of Object.entries(ACCESS_COOKIES)) {
      status[provider] = !!ctx.req.cookies[cookieName];
    }
    return status;
  }),

  disconnect: expressProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(({ input, ctx }) => {
      const cookieName = ACCESS_COOKIES[input.provider];
      if (!cookieName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid provider",
        });
      }

      const cookieOpts = {
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax" as const,
      };
      ctx.res.cookie(cookieName, "", cookieOpts);

      const refreshCookieName = REFRESH_COOKIES[input.provider];
      if (refreshCookieName) {
        ctx.res.cookie(refreshCookieName, "", cookieOpts);
      }

      return { success: true };
    }),
});
