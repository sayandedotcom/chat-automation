/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "agent",
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
    // Domains
    const DOMAINS = {
      main: "agent.tweakleaf.com",
    };

    const chatApi = new sst.aws.Function("ChatLambdaFunction", {
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
      memory: "512 MB",
    });

    // Router
    const apiRouter = new sst.aws.Router("APIRouter", {
      domain: {
        name: DOMAINS.main,
      },
    });

    return {
      apiDomain: apiRouter.url,
    };
  },
});
