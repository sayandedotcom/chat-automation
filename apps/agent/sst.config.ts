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
    const chatApi = new sst.aws.Function("ChatV3", {
      description: "Handler function for chat api.",
      python: {
        container: true,
      },
      handler: "chat/src/chat/api.handler",
      runtime: "python3.10",
      url: {
        cors: false,
      },
      timeout: "60 seconds",
      memory: "1536 MB",
      environment: {
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY ?? "",
        TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? "",
        GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
        GOOGLE_OAUTH_CLIENT_SECRET:
          process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
        LANGSMITH_TRACING: process.env.LANGSMITH_TRACING ?? "false",
        LANGSMITH_ENDPOINT: process.env.LANGSMITH_ENDPOINT ?? "",
        LANGSMITH_API_KEY: process.env.LANGSMITH_API_KEY ?? "",
        LANGSMITH_PROJECT: process.env.LANGSMITH_PROJECT ?? "",
      },
    });

    const router = new sst.aws.Router("ChatRouter", {
      domain: "agent.sayande.xyz",
      routes: {
        "/*": chatApi.url,
      },
    });

    return {
      chatApi: chatApi.url,
      url: router.url,
    };
  },
});
