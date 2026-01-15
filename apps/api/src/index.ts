import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { mountTRPC } from "@workspace/trpc/adapters/express";

async function main() {
  const app = express();

  // Body parsing
  app.use(express.json());

  // CORS configuration
  app.use(
    cors({
      origin: ["http://localhost:3000"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      credentials: true,
    })
  );

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  // Cookie parsing
  app.use(cookieParser());

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
  });
}

main().catch((error) => {
  console.error("[API] Failed to start server:", error);
  process.exit(1);
});
