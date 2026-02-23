import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@workspace/database";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:8000",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account consent",
      accessType: "offline",
    },
  },
  trustedOrigins: process.env.APP_URL
    ? [
        "http://localhost:3000",
        "http://localhost:8080",
        "https://chat.sayande.com",
        process.env.APP_URL,
      ]
    : [
        "http://localhost:3000",
        "http://localhost:8080",
        "https://chat.sayande.com",
      ],
  advanced: {
    defaultCookieAttributes: {
      sameSite: "none",
      secure: true,
    },
  },
});
