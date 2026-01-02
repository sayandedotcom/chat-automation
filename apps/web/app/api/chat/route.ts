import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, thread_id } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Get auth tokens from cookies to pass to the agent
    const cookieStore = await cookies();
    const gmailToken = cookieStore.get("gmail_access_token")?.value;
    const vercelToken = cookieStore.get("vercel_access_token")?.value;
    const notionToken = cookieStore.get("notion_access_token")?.value;

    // Build cookie header for the agent API
    const cookieHeader = [
      gmailToken ? `gmail_access_token=${gmailToken}` : "",
      vercelToken ? `vercel_access_token=${vercelToken}` : "",
      notionToken ? `notion_access_token=${notionToken}` : "",
    ]
      .filter(Boolean)
      .join("; ");

    // Call the FastAPI chat endpoint
    const response = await fetch(`${AGENT_API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body: JSON.stringify({
        message,
        thread_id: thread_id || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Agent API error:", errorText);
      return NextResponse.json(
        { error: "Failed to get response from agent" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
