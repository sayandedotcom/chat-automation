import "dotenv/config";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import passport from "passport";
import { mountTRPC, setSessionGetter } from "@workspace/trpc/adapters/express";
import { config } from "./config/index.js";
import { googleStrategy } from "./services/google.service.js";
import { sessionMiddleware } from "./middlewares/index.js";
import { authRouter, chatRouter, oauthRouter } from "./routes/index.js";
import "./@types/express.d.js";

passport.use(googleStrategy);

async function main() {
  config.validate();

  const app = express();

  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: [config.appUrl],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      credentials: true,
    })
  );

  app.use(express.json());

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use(cookieParser());

  app.use(sessionMiddleware());

  app.use(passport.initialize());

  setSessionGetter(async (req) => {
    if (!req.user) {
      return { user: null, session: null };
    }

    return {
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        image: req.user.image,
      },
      session: {
        id: req.user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    };
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/auth", authRouter);
  app.use("/chat", chatRouter);
  app.use("/oauth", oauthRouter);

  mountTRPC(app);

  app.listen(config.port, () => {
    console.log(`[API] Server listening on http://localhost:${config.port}`);
    console.log(`[API] tRPC endpoint: http://localhost:${config.port}/trpc`);
    console.log(`[API] Auth endpoints: http://localhost:${config.port}/auth/*`);
  });
}

main().catch((error) => {
  console.error("[API] Failed to start server:", error);
  process.exit(1);
});
