import { Router, type IRouter } from "express";
import { Readable, Transform } from "stream";
import { getRefreshedTokens, getConnectedIntegrations } from "@workspace/trpc/lib/token-utils";

const AGENT_API_URL = process.env.AGENT_API_URL as string;

export const chatExpressRouter: IRouter = Router();

/**
 * POST /chat/stream
 * Proxy SSE streaming from the agent service.
 * Uses plain Express (not tRPC) because tRPC cannot stream raw SSE.
 */
chatExpressRouter.post("/stream", async (req, res) => {
  const { request, thread_id } = req.body as {
    request?: string;
    thread_id?: string | null;
  };

  if (!request) {
    res.status(400).json({ error: "Request is required" });
    return;
  }

  const { gmailToken, notionToken, vercelToken, slackToken } = await getRefreshedTokens(req, res);
  const connectedIntegrations = getConnectedIntegrations(req);

  // 30s timeout for the initial connection to the agent (not the stream itself)
  const controller = new AbortController();
  const connectTimeout = setTimeout(() => controller.abort(), 30_000);

  let agentResponse: Response;
  try {
    agentResponse = await fetch(`${AGENT_API_URL}/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request,
        thread_id: thread_id ?? null,
        gmail_token: gmailToken,
        notion_token: notionToken,
        vercel_token: vercelToken,
        slack_token: slackToken,
        connected_integrations: connectedIntegrations,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(connectTimeout);
    const isTimeout = err instanceof DOMException && err.name === "AbortError";
    console.error(isTimeout ? "Agent connection timed out" : "Failed to connect to agent:", err);
    res
      .status(502)
      .json({
        error: isTimeout ? "Agent service timed out" : "Failed to connect to agent service",
      });
    return;
  }
  clearTimeout(connectTimeout);

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text();
    console.error("Workflow stream API error:", errorText);
    res.status(agentResponse.status).json({ error: "Failed to start workflow stream" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Convert Web Readable stream to Node.js Readable and pipe to response
  const nodeReadable = Readable.fromWeb(
    agentResponse.body as Parameters<typeof Readable.fromWeb>[0]
  );

  // Convert agent heartbeat data events into SSE comments (`: keepalive\n\n`).
  // SSE comments are silently ignored by EventSource / browser clients but
  // still keep every hop (Agent → API → ALB → Browser) alive.
  const heartbeatRewriter = new Transform({
    transform(chunk, _encoding, callback) {
      const text = chunk.toString();
      const out = text.replace(/data: \{"type":\s*"heartbeat"\}\n\n/g, ": keepalive\n\n");
      if (out.length > 0) {
        this.push(out);
      }
      callback();
    },
  });

  nodeReadable.pipe(heartbeatRewriter).pipe(res);

  req.on("close", () => {
    nodeReadable.destroy();
  });

  nodeReadable.on("error", (err) => {
    console.error("Stream error:", err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ type: "error", message: String(err) })}\n\n`);
      res.end();
    }
  });
});
