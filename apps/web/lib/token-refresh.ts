import { cookies } from "next/headers";

/**
 * Refresh a Gmail access token using the stored refresh token.
 * Only updates the cookie — does NOT sync to MCP credential store.
 * MCP credentials should only be written during the OAuth callback.
 */
export async function refreshGmailToken(
  refreshToken: string,
): Promise<string | null> {
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

    const cookieStore = await cookies();
    cookieStore.set("gmail_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: data.expires_in,
    });

    console.log("Gmail access token refreshed successfully");
    return data.access_token;
  } catch (error) {
    console.error("Error refreshing Gmail token:", error);
    return null;
  }
}

/**
 * Get all integration tokens from cookies, refreshing Gmail if possible.
 * Use this for endpoints that START new workflows (chat, stream).
 */
export async function getRefreshedTokens(): Promise<{
  gmailToken: string | null;
  notionToken: string | null;
  slackToken: string | null;
}> {
  const cookieStore = await cookies();
  let gmailToken = cookieStore.get("gmail_access_token")?.value ?? null;
  const gmailRefreshToken =
    cookieStore.get("gmail_refresh_token")?.value ?? null;
  const notionToken = cookieStore.get("notion_access_token")?.value ?? null;
  const slackToken = cookieStore.get("slack_access_token")?.value ?? null;

  if (gmailRefreshToken) {
    const freshToken = await refreshGmailToken(gmailRefreshToken);
    if (freshToken) {
      gmailToken = freshToken;
    }
  }

  return { gmailToken, notionToken, slackToken };
}

/**
 * Get tokens from cookies WITHOUT refreshing.
 * Use this for resume/retry endpoints that continue existing workflows —
 * changing the token would create a new service cache key and lose the workflow.
 */
export async function getTokensFromCookies(): Promise<{
  gmailToken: string | null;
  notionToken: string | null;
  slackToken: string | null;
}> {
  const cookieStore = await cookies();
  return {
    gmailToken: cookieStore.get("gmail_access_token")?.value ?? null,
    notionToken: cookieStore.get("notion_access_token")?.value ?? null,
    slackToken: cookieStore.get("slack_access_token")?.value ?? null,
  };
}
