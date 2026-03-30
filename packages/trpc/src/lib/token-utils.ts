import type { Request, Response } from "express";

import {
  type StoredGoogleCredentials,
  getConnectedGoogleServices,
  refreshGoogleCredentialsIfNeeded,
} from "./google-integration-utils.js";

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
  };
};

/**
 * Refresh a Gmail access token using the stored refresh token.
 * Sets the new access_token cookie on the Express response.
 */
export async function refreshGmailToken(
  refreshToken: string,
  res: Response
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
 * All Google Workspace services share the same OAuth — any one cookie proves auth
 * for MCP tool execution (same scopes via include_granted_scopes).
 */
const GOOGLE_ACCESS_COOKIES = [
  "gmail_access_token",
  "google_docs_access_token",
  "google_sheets_access_token",
  "google_slides_access_token",
  "google_drive_access_token",
  "google_calendar_access_token",
] as const;

function getAnyGoogleToken(req: Request): string | null {
  for (const name of GOOGLE_ACCESS_COOKIES) {
    const val = req.cookies[name] as string | undefined;
    if (val) return val;
  }
  return null;
}

/**
 * Per-integration cookie map — used to build the connected_integrations list.
 * Keys are integration IDs (kebab-case), values are cookie names.
 */
const ACCESS_COOKIES: Record<string, string> = {
  gmail: "gmail_access_token",
  "google-docs": "google_docs_access_token",
  "google-sheets": "google_sheets_access_token",
  "google-slides": "google_slides_access_token",
  "google-drive": "google_drive_access_token",
  "google-calendar": "google_calendar_access_token",
  vercel: "vercel_access_token",
  notion: "notion_access_token",
};

/**
 * Return the list of integration IDs whose access-token cookie is present.
 * Used by the agent's pre-flight auth check to decide per-integration auth.
 */
export async function getConnectedIntegrations(req: Request): Promise<string[]> {
  const connected: string[] = [];
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.id) {
    connected.push(...(await getConnectedGoogleServices(authReq.user.id)));
  }
  for (const [id, cookieName] of Object.entries(ACCESS_COOKIES)) {
    if (id.startsWith("google-")) {
      continue;
    }
    if (req.cookies[cookieName]) connected.push(id);
  }
  return connected;
}

export async function getRefreshedTokens(
  req: Request,
  _res: Response
): Promise<{
  gmailToken: string | null;
  googleCredentials: StoredGoogleCredentials | null;
  notionToken: string | null;
  vercelToken: string | null;
  slackToken: string | null;
}> {
  let googleCredentials: StoredGoogleCredentials | null = null;
  const authReq = req as AuthenticatedRequest;
  if (authReq.user?.id) {
    googleCredentials = await refreshGoogleCredentialsIfNeeded(authReq.user.id);
  }

  let gmailToken = googleCredentials?.accessToken ?? null;
  const notionToken = (req.cookies["notion_access_token"] as string) ?? null;
  const vercelToken = (req.cookies["vercel_access_token"] as string) ?? null;
  const slackToken = (req.cookies["slack_access_token"] as string) ?? null;
  if (!gmailToken) {
    gmailToken = getAnyGoogleToken(req);
  }

  return { gmailToken, googleCredentials, notionToken, vercelToken, slackToken };
}

/**
 * Get tokens from cookies WITHOUT refreshing.
 * Use this for resume/retry endpoints that continue existing workflows —
 * changing the token would create a new service cache key and lose the workflow.
 */
export function getTokensFromCookies(req: Request): {
  gmailToken: string | null;
  googleCredentials: null;
  notionToken: string | null;
  vercelToken: string | null;
  slackToken: string | null;
} {
  return {
    gmailToken: getAnyGoogleToken(req),
    googleCredentials: null,
    notionToken: (req.cookies["notion_access_token"] as string) ?? null,
    vercelToken: (req.cookies["vercel_access_token"] as string) ?? null,
    slackToken: (req.cookies["slack_access_token"] as string) ?? null,
  };
}
