import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Load root .env before Next.js processes env vars so NEXT_PUBLIC_* vars
// are available when the client bundle is compiled.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui", "@workspace/database"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
