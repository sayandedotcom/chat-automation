import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@workspace/database";

/**
 * Lightweight Better Auth instance for session verification only.
 * Login/signup/OAuth callbacks are handled by Next.js.
 * This instance shares the same DB and secret so it can verify
 * session cookies set by Next.js.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // No emailAndPassword or socialProviders needed —
  // Express only verifies sessions created by Next.js
});
