import { NextRequest } from "next/server";
import { getRefreshedTokens } from "@/lib/token-refresh";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8000";

/**
 * Stream workflow execution with Server-Sent Events
 * POST /api/chat/stream
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request: workflowRequest, thread_id } = body;

    if (!workflowRequest) {
      return new Response(JSON.stringify({ error: "Request is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { gmailToken, notionToken, slackToken } =
      await getRefreshedTokens();

    // Call the FastAPI workflow stream endpoint
    const response = await fetch(`${AGENT_API_URL}/chat/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        request: workflowRequest,
        thread_id: thread_id || null,
        gmail_token: gmailToken || null,
        notion_token: notionToken || null,
        slack_token: slackToken || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Workflow stream API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to start workflow stream" }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Forward the SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (error) {
          console.error("Stream error:", error);
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "error", message: String(error) })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Workflow stream API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
