import { env } from "../env.js";

export const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parseInt(process.env.PORT ?? "8000", 10),
  appUrl: env.APP_URL ?? "http://localhost:3000",
  databaseUrl: env.DATABASE_URL,
  sessionSecret: env.SESSION_SECRET,
  cookieMaxAge: COOKIE_MAX_AGE,
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    callbackUrl: env.GOOGLE_CALLBACK_URL ?? "/auth/google/callback",
  },
  notion: {
    clientId: env.NOTION_CLIENT_ID,
    clientSecret: env.NOTION_CLIENT_SECRET,
    redirectUri: env.NOTION_REDIRECT_URI,
  },
  isProduction: process.env.NODE_ENV === "production",
};

export function validateEnv(): void {
  void env;
}
