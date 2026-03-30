import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  disconnectGoogleService,
  getConnectedGoogleServices,
  isGoogleService,
} from "../lib/google-integration-utils.js";
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
type ExpressUserRequest = ExpressContext["req"] & {
  user?: {
    id: string;
  };
};

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
  status: expressProcedure.query(async ({ ctx }) => {
    const req = ctx.req as ExpressUserRequest;
    const status: Record<string, boolean> = {};
    const googleConnections = req.user?.id
      ? new Set(await getConnectedGoogleServices(req.user.id))
      : new Set<string>();

    for (const [provider, cookieName] of Object.entries(ACCESS_COOKIES)) {
      if (isGoogleService(provider)) {
        status[provider] = googleConnections.has(provider);
        continue;
      }
      status[provider] = !!req.cookies[cookieName];
    }
    return status;
  }),

  disconnect: expressProcedure
    .input(z.object({ provider: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const req = ctx.req as ExpressUserRequest;
      const cookieName = ACCESS_COOKIES[input.provider];
      if (!cookieName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid provider",
        });
      }

      if (isGoogleService(input.provider)) {
        if (!req.user?.id) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Authentication required",
          });
        }

        await disconnectGoogleService(req.user.id, input.provider);
        return { success: true };
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
