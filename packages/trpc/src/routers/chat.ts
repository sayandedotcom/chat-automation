import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, middleware } from "../server/trpc.js";
import type { ExpressContext } from "../server/context.js";
import {
  getRefreshedTokens,
  getTokensFromCookies,
} from "../lib/token-utils.js";

const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:8001";

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

export const chatRouter = router({
  execute: expressProcedure
    .input(
      z.object({
        request: z.string().min(1),
        thread_id: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { gmailToken, notionToken, slackToken } =
        await getRefreshedTokens(ctx.req, ctx.res);

      const response = await fetch(`${AGENT_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request: input.request,
          thread_id: input.thread_id ?? null,
          gmail_token: gmailToken,
          notion_token: notionToken,
          slack_token: slackToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Workflow API error:", errorText);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to execute workflow",
        });
      }

      return response.json();
    }),

  resume: expressProcedure
    .input(
      z.object({
        thread_id: z.string(),
        action: z.enum(["approve", "edit", "skip"]),
        content: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { gmailToken, notionToken, slackToken } = getTokensFromCookies(
        ctx.req,
      );

      const response = await fetch(`${AGENT_API_URL}/chat/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: input.thread_id,
          action: input.action,
          content: input.content ?? null,
          gmail_token: gmailToken,
          notion_token: notionToken,
          slack_token: slackToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Workflow resume API error:", errorText);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to resume workflow",
        });
      }

      return response.json();
    }),

  retry: expressProcedure
    .input(
      z.object({
        thread_id: z.string(),
        step_number: z.number(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { gmailToken, notionToken, slackToken } = getTokensFromCookies(
        ctx.req,
      );

      const response = await fetch(`${AGENT_API_URL}/chat/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: input.thread_id,
          step_number: input.step_number,
          gmail_token: gmailToken,
          notion_token: notionToken,
          slack_token: slackToken,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Workflow retry API error:", errorText);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retry workflow step",
        });
      }

      return response.json();
    }),
});
