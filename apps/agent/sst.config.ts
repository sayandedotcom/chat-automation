/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "chat-automation-agent",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
        },
      },
    };
  },
  async run() {
    const vpc = new sst.aws.Vpc("AgentVpc", { nat: "managed" });
    const cluster = new sst.aws.Cluster("AgentCluster", { vpc });

    const service = new sst.aws.Service("AgentService", {
      cluster,
      loadBalancer: {
        domain: "agent.sayande.xyz",
        ports: [
          { listen: "443/https", forward: "8000/http" },
          { listen: "80/http", redirect: "443/https" },
        ],
        health: {
          path: "/healthz",
          grace: "60s",
        },
      },
      image: {
        context: ".",
        dockerfile: "Dockerfile",
      },
      environment: {
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? "",
        TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? "",
        GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
        LANGSMITH_TRACING: process.env.LANGSMITH_TRACING ?? "false",
        LANGSMITH_ENDPOINT: process.env.LANGSMITH_ENDPOINT ?? "",
        LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY ?? "",
        LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT ?? "",
      },
    });

    return {
      url: service.url,
    };
  },
});
