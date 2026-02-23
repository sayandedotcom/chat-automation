/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@workspace/ui", "@workspace/database"],
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
