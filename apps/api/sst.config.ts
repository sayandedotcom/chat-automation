/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "chat-automation-api",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const vpc = new sst.aws.Vpc("ApiVpc", { nat: "managed" });
    const cluster = new sst.aws.Cluster("ApiCluster", { vpc });

    const service = new sst.aws.Service("ApiService", {
      cluster,
      loadBalancer: {
        ports: [{ listen: "80/http" }],
      },
      image: {
        context: "../../",
        dockerfile: "apps/api/Dockerfile",
      },
      dev: {
        command: "pnpm dev",
      },
      environment: {
        NODE_ENV: "production",
        DATABASE_URL: process.env.DATABASE_URL!,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL!,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
        AGENT_API_URL: process.env.AGENT_API_URL!,
        APP_URL: process.env.APP_URL!,
        API_BASE_URL: process.env.API_BASE_URL!,
        NOTION_CLIENT_ID: process.env.NOTION_CLIENT_ID ?? "",
        NOTION_CLIENT_SECRET: process.env.NOTION_CLIENT_SECRET ?? "",
        NOTION_REDIRECT_URI: process.env.NOTION_REDIRECT_URI ?? "",
        GMAIL_REDIRECT_URI: process.env.GMAIL_REDIRECT_URI ?? "",
      },
    });

    return {
      api: service.url,
    };
  },
});
