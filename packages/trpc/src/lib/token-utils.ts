import type { Request, Response } from "express";

async function refreshGoogleToken(
  refreshToken: string,
  res: Response,
  accessCookieName: string
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
      console.error(`Failed to refresh ${accessCookieName}:`, await response.text());
      return null;
    }

    const data = await response.json();
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie(accessCookieName, data.access_token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: data.expires_in * 1000,
    });

    console.log(`${accessCookieName} refreshed successfully`);
    return data.access_token;
  } catch (error) {
    console.error(`Error refreshing ${accessCookieName}:`, error);
    return null;
  }
}

const GOOGLE_SERVICES = [
  { access: "gmail_access_token", refresh: "gmail_refresh_token" },
  { access: "google_docs_access_token", refresh: "google_docs_refresh_token" },
  { access: "google_sheets_access_token", refresh: "google_sheets_refresh_token" },
  { access: "google_slides_access_token", refresh: "google_slides_refresh_token" },
  { access: "google_drive_access_token", refresh: "google_drive_refresh_token" },
  { access: "google_calendar_access_token", refresh: "google_calendar_refresh_token" },
] as const;

function getAnyGoogleToken(req: Request): string | null {
  for (const service of GOOGLE_SERVICES) {
    const val = req.cookies[service.access] as string | undefined;
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
export function getConnectedIntegrations(req: Request): string[] {
  const connected: string[] = [];
  for (const [id, cookieName] of Object.entries(ACCESS_COOKIES)) {
    if (req.cookies[cookieName]) connected.push(id);
  }
  return connected;
}

export async function getRefreshedTokens(
  req: Request,
  res: Response
): Promise<{
  gmailToken: string | null;
  notionToken: string | null;
  vercelToken: string | null;
  slackToken: string | null;
}> {
  const notionToken = (req.cookies["notion_access_token"] as string) ?? null;
  const vercelToken = (req.cookies["vercel_access_token"] as string) ?? null;
  const slackToken = (req.cookies["slack_access_token"] as string) ?? null;

  let gmailToken: string | null = null;
  for (const service of GOOGLE_SERVICES) {
    const refreshToken = req.cookies[service.refresh] as string | undefined;
    if (refreshToken) {
      const freshToken = await refreshGoogleToken(refreshToken, res, service.access);
      if (service.access === "gmail_access_token" && freshToken) {
        gmailToken = freshToken;
      }
    }
  }

  if (!gmailToken) {
    gmailToken = getAnyGoogleToken(req);
  }

  return { gmailToken, notionToken, vercelToken, slackToken };
}

/**
 * Get tokens from cookies WITHOUT refreshing.
 * Use this for resume/retry endpoints that continue existing workflows —
 * changing the token would create a new service cache key and lose the workflow.
 */
export function getTokensFromCookies(req: Request): {
  gmailToken: string | null;
  notionToken: string | null;
  vercelToken: string | null;
  slackToken: string | null;
} {
  return {
    gmailToken: getAnyGoogleToken(req),
    notionToken: (req.cookies["notion_access_token"] as string) ?? null,
    vercelToken: (req.cookies["vercel_access_token"] as string) ?? null,
    slackToken: (req.cookies["slack_access_token"] as string) ?? null,
  };
}
