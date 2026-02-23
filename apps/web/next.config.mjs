import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    "/**": [
      "./packages/database/src/generated/client/**/*.node",
      "./packages/database/src/generated/client/schema.prisma",
    ],
  },
  transpilePackages: ["@workspace/ui"],
  serverExternalPackages: ["@prisma/client", "@workspace/database"],
};

export default nextConfig;
