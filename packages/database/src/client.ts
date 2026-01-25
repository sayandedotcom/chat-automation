import { PrismaClient } from "./generated/client/index.js";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma Client instance.
 * In development, we store the client on global to prevent
 * creating multiple instances due to hot reloading.
 */
export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export { PrismaClient };
