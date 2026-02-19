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
    const vpc = new sst.aws.Vpc("ApiVpc");
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
        DATABASE_URL: process.env.DATABASE_URL!,
        BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
        BETTER_AUTH_URL: process.env.BETTER_AUTH_URL!,
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
      },
    });

    return {
      api: service.url,
    };
  },
});
