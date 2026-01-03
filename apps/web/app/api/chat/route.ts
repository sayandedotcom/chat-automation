import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8001";

// Refresh Gmail access token using refresh token
async function refreshGmailToken(refreshToken: string): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing Google OAuth credentials for token refresh");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("Failed to refresh Gmail token:", await response.text());
      return null;
    }

    const data = await response.json();

    // Update the access token cookie
    const cookieStore = await cookies();
    cookieStore.set("gmail_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: data.expires_in,
    });

    console.log("✅ Gmail access token refreshed successfully");
    return data.access_token;
  } catch (error) {
    console.error("Error refreshing Gmail token:", error);
    return null;
  }
}

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
    let gmailToken = cookieStore.get("gmail_access_token")?.value;
    const gmailRefreshToken = cookieStore.get("gmail_refresh_token")?.value;
    const vercelToken = cookieStore.get("vercel_access_token")?.value;
    const notionToken = cookieStore.get("notion_access_token")?.value;

    // Always refresh Gmail token if we have a refresh token (ensures fresh token)
    if (gmailRefreshToken) {
      console.log("🔄 Refreshing Gmail access token...");
      const freshToken = await refreshGmailToken(gmailRefreshToken);
      if (freshToken) {
        gmailToken = freshToken;
      }
    }

    // Call the FastAPI chat endpoint with tokens in the body
    const response = await fetch(`${AGENT_API_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        thread_id: thread_id || null,
        // Pass OAuth tokens for MCP integrations
        gmail_token: gmailToken || null,
        vercel_token: vercelToken || null,
        notion_token: notionToken || null,
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
