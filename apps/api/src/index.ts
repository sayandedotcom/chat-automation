import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { fromNodeHeaders } from "better-auth/node";
import { mountTRPC, setSessionGetter } from "@workspace/trpc/adapters/express";
import { auth } from "./lib/auth.js";
import { chatExpressRouter } from "./routes/chat.js";
import { oauthRouter } from "./routes/oauth/index.js";

async function main() {
  const app = express();

  // Trust nginx reverse proxy — allows reading X-Forwarded-* headers
  app.set("trust proxy", 1);

  // CORS configuration (BEFORE auth handler for preflight)
  app.use(
    cors({
      origin: [
        process.env.APP_URL as string,
        process.env.BETTER_AUTH_URL as string,
      ].filter(Boolean),
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      credentials: true,
    }),
  );

  // Better Auth login/signup/OAuth is handled by Next.js.
  // Express only uses auth.api.getSession() for session verification.

  // Body parsing
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

  // SSE chat streaming (plain Express — tRPC cannot stream raw SSE)
  app.use("/chat", chatExpressRouter);

  // OAuth flows (plain Express — needs HTTP redirects)
  app.use("/oauth", oauthRouter);

  // Mount tRPC on /trpc
  mountTRPC(app);

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8000;

  app.listen(PORT, () => {
    console.log(`[API] Server listening on http://localhost:${PORT}`);
    console.log(`[API] tRPC endpoint: http://localhost:${PORT}/trpc`);
  });
}

main().catch((error) => {
  console.error("[API] Failed to start server:", error);
  process.exit(1);
});
