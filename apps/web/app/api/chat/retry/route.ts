import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8000";

/**
 * Retry a failed workflow step
 * POST /api/chat/retry
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { thread_id, step_number } = body;

    if (!thread_id || !step_number) {
      return NextResponse.json(
        { error: "thread_id and step_number are required" },
        { status: 400 },
      );
    }

    // Get auth tokens from cookies
    const cookieStore = await cookies();
    const gmailToken = cookieStore.get("gmail_access_token")?.value;
    const notionToken = cookieStore.get("notion_access_token")?.value;
    const slackToken = cookieStore.get("slack_access_token")?.value;

    // Call the FastAPI workflow retry endpoint
    const response = await fetch(`${AGENT_API_URL}/chat/retry`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        thread_id,
        step_number,
        gmail_token: gmailToken || null,
        notion_token: notionToken || null,
        slack_token: slackToken || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Workflow retry API error:", errorText);
      return NextResponse.json(
        { error: "Failed to retry workflow step" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Workflow retry API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
