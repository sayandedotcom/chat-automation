import type { Request, Response } from "express";

/**
 * Refresh a Gmail access token using the stored refresh token.
 * Sets the new access_token cookie on the Express response.
 */
export async function refreshGmailToken(
  refreshToken: string,
  res: Response,
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    const isProduction = process.env.NODE_ENV === "production";

    // Express res.cookie maxAge is in milliseconds
    res.cookie("gmail_access_token", data.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: data.expires_in * 1000,
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
export async function getRefreshedTokens(
  req: Request,
  res: Response,
): Promise<{
  gmailToken: string | null;
  notionToken: string | null;
  slackToken: string | null;
}> {
  let gmailToken = (req.cookies["gmail_access_token"] as string) ?? null;
  const gmailRefreshToken =
    (req.cookies["gmail_refresh_token"] as string) ?? null;
  const notionToken = (req.cookies["notion_access_token"] as string) ?? null;
  const slackToken = (req.cookies["slack_access_token"] as string) ?? null;

  if (gmailRefreshToken) {
    const freshToken = await refreshGmailToken(gmailRefreshToken, res);
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
export function getTokensFromCookies(req: Request): {
  gmailToken: string | null;
  notionToken: string | null;
  slackToken: string | null;
} {
  return {
    gmailToken: (req.cookies["gmail_access_token"] as string) ?? null,
    notionToken: (req.cookies["notion_access_token"] as string) ?? null,
    slackToken: (req.cookies["slack_access_token"] as string) ?? null,
  };
}
