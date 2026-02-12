import { NextRequest, NextResponse } from "next/server";
import { getTokensFromCookies } from "@/lib/token-refresh";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8000";

/**
 * Resume a paused workflow with HITL decision
 * POST /api/chat/resume
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, action, content } = body;

    if (!thread_id || !action) {
      return NextResponse.json(
        { error: "thread_id and action are required" },
        { status: 400 },
      );
    }

    const { gmailToken, notionToken, slackToken } =
      await getTokensFromCookies();

    // Call the FastAPI workflow resume endpoint
    const response = await fetch(`${AGENT_API_URL}/chat/resume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        thread_id,
        action,
        content: content || null,
        gmail_token: gmailToken || null,
        notion_token: notionToken || null,
        slack_token: slackToken || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Workflow resume API error:", errorText);
      return NextResponse.json(
        { error: "Failed to resume workflow" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Workflow resume API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
