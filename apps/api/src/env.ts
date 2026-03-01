import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    SESSION_SECRET: z.string().min(32),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_CALLBACK_URL: z.string().min(1),
    APP_URL: z.string().url().optional(),
    API_BASE_URL: z.string().url().optional(),
    AGENT_API_URL: z.string().url().optional(),
    NOTION_CLIENT_ID: z.string().min(1).optional(),
    NOTION_CLIENT_SECRET: z.string().min(1).optional(),
    NOTION_REDIRECT_URI: z.string().url().optional(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,
    APP_URL: process.env.APP_URL,
    API_BASE_URL: process.env.API_BASE_URL,
    AGENT_API_URL: process.env.AGENT_API_URL,
    NOTION_CLIENT_ID: process.env.NOTION_CLIENT_ID,
    NOTION_CLIENT_SECRET: process.env.NOTION_CLIENT_SECRET,
    NOTION_REDIRECT_URI: process.env.NOTION_REDIRECT_URI,
  },
});
