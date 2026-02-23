import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@workspace/database/client";

export const auth = betterAuth({
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
  trustedOrigins: [
    "http://localhost:3000",
    process.env.NEXT_PUBLIC_APP_URL ?? "",
  ].filter(Boolean),
});
