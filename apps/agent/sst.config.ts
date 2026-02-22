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

    const router = new sst.aws.Router("ChatRouter", {
      domain: "chat.tweakleaf.com",
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
