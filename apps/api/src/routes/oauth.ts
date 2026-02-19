import { Router, type IRouter, type Request, type Response } from "express";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:8001";
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const oauthRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// Google helpers
// ---------------------------------------------------------------------------

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

function googleAuthInit(res: Response, scopes: string, redirectUri: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "GOOGLE_CLIENT_ID not configured" });
    return;
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  res.redirect(url.toString());
}

async function googleAuthCallback(
  req: Request,
  res: Response,
  provider: string,
  accessCookie: string,
  refreshCookie: string,
  redirectUri: string,
) {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) return res.redirect(`${APP_URL}/integrations?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect(`${APP_URL}/integrations?error=no_code`);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return res.redirect(`${APP_URL}/integrations?error=missing_credentials`);

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    });

    if (!tokenRes.ok) {
      console.error(`${provider} token exchange failed:`, await tokenRes.text());
      return res.redirect(`${APP_URL}/integrations?error=token_exchange_failed`);
    }

    const tokens: GoogleTokenResponse = await tokenRes.json();

    res.cookie(accessCookie, tokens.access_token, { httpOnly: true, secure: IS_PRODUCTION, sameSite: "lax", maxAge: tokens.expires_in * 1000 });
    if (tokens.refresh_token)
      res.cookie(refreshCookie, tokens.refresh_token, { httpOnly: true, secure: IS_PRODUCTION, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });

    // Sync to MCP credential store
    try {
      const ok = await fetch(`${AGENT_API_URL}/sync-gmail-credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: tokens.access_token, refresh_token: tokens.refresh_token ?? "", client_id: clientId, client_secret: clientSecret, scopes: tokens.scope.split(" ") }),
      });
      console.log(ok.ok ? `✅ ${provider} synced to MCP` : `⚠️ ${provider} MCP sync failed`);
    } catch { /* non-fatal */ }

    res.redirect(`${APP_URL}/integrations?success=${provider}`);
  } catch (err) {
    console.error(`${provider} OAuth error:`, err);
    res.redirect(`${APP_URL}/integrations?error=oauth_failed`);
  }
}

// ---------------------------------------------------------------------------
// Google providers — data-driven registration
// ---------------------------------------------------------------------------

const GOOGLE_PROVIDERS = [
  {
    id: "gmail",
    envKey: "GMAIL_REDIRECT_URI",
    accessCookie: "gmail_access_token",
    refreshCookie: "gmail_refresh_token",
    scopes: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.labels",
  },
  {
    id: "google-docs",
    envKey: "GOOGLE_DOCS_REDIRECT_URI",
    accessCookie: "google_docs_access_token",
    refreshCookie: "google_docs_refresh_token",
    scopes: "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
  },
  {
    id: "google-sheets",
    envKey: "GOOGLE_SHEETS_REDIRECT_URI",
    accessCookie: "google_sheets_access_token",
    refreshCookie: "google_sheets_refresh_token",
    scopes: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
  },
  {
    id: "google-slides",
    envKey: "GOOGLE_SLIDES_REDIRECT_URI",
    accessCookie: "google_slides_access_token",
    refreshCookie: "google_slides_refresh_token",
    scopes: "https://www.googleapis.com/auth/presentations https://www.googleapis.com/auth/presentations.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
  },
  {
    id: "google-drive",
    envKey: "GOOGLE_DRIVE_REDIRECT_URI",
    accessCookie: "google_drive_access_token",
    refreshCookie: "google_drive_refresh_token",
    scopes: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly",
  },
  {
    id: "google-calendar",
    envKey: "GOOGLE_CALENDAR_REDIRECT_URI",
    accessCookie: "google_calendar_access_token",
    refreshCookie: "google_calendar_refresh_token",
    scopes: "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
  },
] as const;

for (const p of GOOGLE_PROVIDERS) {
  const callbackPath = `/${p.id}/callback`;
  const getRedirectUri = () =>
    (process.env[p.envKey] as string | undefined) ?? `${API_BASE_URL}/oauth/${p.id}/callback`;

  oauthRouter.get(`/${p.id}`, (_req, res) => googleAuthInit(res, p.scopes, getRedirectUri()));
  oauthRouter.get(callbackPath, (req, res) =>
    googleAuthCallback(req, res, p.id, p.accessCookie, p.refreshCookie, getRedirectUri()),
  );
}

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------

oauthRouter.get("/notion", (_req, res) => {
  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "NOTION_CLIENT_ID not configured" });
  const redirectUri = process.env.NOTION_REDIRECT_URI ?? `${API_BASE_URL}/oauth/notion/callback`;
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  res.redirect(url.toString());
});

oauthRouter.get("/notion/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) return res.redirect(`${APP_URL}/integrations?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect(`${APP_URL}/integrations?error=no_code`);

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return res.redirect(`${APP_URL}/integrations?error=missing_credentials`);

  const redirectUri = process.env.NOTION_REDIRECT_URI ?? `${API_BASE_URL}/oauth/notion/callback`;

  try {
    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });

    if (!tokenRes.ok) {
      console.error("Notion token exchange failed:", await tokenRes.text());
      return res.redirect(`${APP_URL}/integrations?error=token_exchange_failed`);
    }

    const { access_token } = await tokenRes.json() as { access_token: string };
    res.cookie("notion_access_token", access_token, { httpOnly: true, secure: IS_PRODUCTION, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect(`${APP_URL}/integrations?success=notion`);
  } catch (err) {
    console.error("Notion OAuth error:", err);
    res.redirect(`${APP_URL}/integrations?error=oauth_failed`);
  }
});

// ---------------------------------------------------------------------------
// Vercel
// ---------------------------------------------------------------------------

oauthRouter.get("/vercel", (_req, res) => {
  const clientId = process.env.VERCEL_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "VERCEL_CLIENT_ID not configured" });
  const redirectUri = process.env.VERCEL_REDIRECT_URI ?? `${API_BASE_URL}/oauth/vercel/callback`;
  const url = new URL("https://vercel.com/integrations/new");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  res.redirect(url.toString());
});

oauthRouter.get("/vercel/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) return res.redirect(`${APP_URL}/integrations?error=${encodeURIComponent(error)}`);
  if (!code) return res.redirect(`${APP_URL}/integrations?error=no_code`);

  const clientId = process.env.VERCEL_CLIENT_ID;
  const clientSecret = process.env.VERCEL_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return res.redirect(`${APP_URL}/integrations?error=missing_credentials`);

  const redirectUri = process.env.VERCEL_REDIRECT_URI ?? `${API_BASE_URL}/oauth/vercel/callback`;

  try {
    const tokenRes = await fetch("https://api.vercel.com/v2/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }),
    });

    if (!tokenRes.ok) {
      console.error("Vercel token exchange failed:", await tokenRes.text());
      return res.redirect(`${APP_URL}/integrations?error=token_exchange_failed`);
    }

    const { access_token } = await tokenRes.json() as { access_token: string };
    res.cookie("vercel_access_token", access_token, { httpOnly: true, secure: IS_PRODUCTION, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.redirect(`${APP_URL}/integrations?success=vercel`);
  } catch (err) {
    console.error("Vercel OAuth error:", err);
    res.redirect(`${APP_URL}/integrations?error=oauth_failed`);
  }
});
