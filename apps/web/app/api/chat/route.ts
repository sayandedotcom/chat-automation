import { NextRequest, NextResponse } from "next/server";
import { getRefreshedTokens } from "@/lib/token-refresh";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8000";

/**
 * Execute a dynamic workflow
 * POST /api/chat
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { request: workflowRequest, thread_id } = body;

    if (!workflowRequest) {
      return NextResponse.json(
        { error: "Request is required" },
        { status: 400 },
      );
    }

    const { gmailToken, notionToken, slackToken } =
      await getRefreshedTokens();

    // Call the FastAPI workflow endpoint
    const response = await fetch(`${AGENT_API_URL}/chat`, {
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
      console.error("Workflow API error:", errorText);
      return NextResponse.json(
        { error: "Failed to execute workflow" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Workflow API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
