import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { mountTRPC, setSessionGetter } from "@workspace/trpc/adapters/express";
import { auth } from "./lib/auth.js";

async function main() {
  const app = express();

  // CORS configuration (BEFORE auth handler for preflight)
  app.use(
    cors({
      origin: ["http://localhost:3000"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      credentials: true,
    }),
  );

  // Better Auth handler BEFORE body parsing (Express v5 uses /*splat)
  // This is critical - express.json() breaks Better Auth if mounted first
  app.all("/api/auth/*splat", toNodeHandler(auth));

  // Body parsing AFTER Better Auth handler
  app.use(express.json());

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // Cookie parsing
  app.use(cookieParser());

  // Configure tRPC to use Better Auth sessions
  setSessionGetter(async (req) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
      return { user: null, session: null };
    }

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        image: session.user.image ?? null,
      },
      session: {
        id: session.session.id,
        expiresAt: session.session.expiresAt,
      },
    };
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Mount tRPC on /trpc
  mountTRPC(app);

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;

  app.listen(PORT, () => {
    console.log(`[API] Server listening on http://localhost:${PORT}`);
    console.log(`[API] tRPC endpoint: http://localhost:${PORT}/trpc`);
    console.log(`[API] Auth endpoint: http://localhost:${PORT}/api/auth`);
  });
}

main().catch((error) => {
  console.error("[API] Failed to start server:", error);
  process.exit(1);
});
