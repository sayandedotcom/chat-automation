/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui"],
  serverExternalPackages: ["@prisma/client", "@workspace/database"],
};

export default nextConfig;
