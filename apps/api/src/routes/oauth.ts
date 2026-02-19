import { Router, type IRouter, type Request, type Response } from "express";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const AGENT_API_URL = process.env.AGENT_API_URL ?? "http://localhost:8001";
const API_BASE_URL = process.env.API_BASE_URL ?? "http://localhost:8000";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const oauthRouter: IRouter = Router();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Build a Google OAuth consent URL and redirect the user to it.
 */
function googleAuthInit(
  res: Response,
  scopes: string,
  redirectUri: string,
): void {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    res.status(500).json({ error: "GOOGLE_CLIENT_ID not configured" });
    return;
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");

  res.redirect(authUrl.toString());
}

interface GoogleCallbackOptions {
  provider: string;
  accessCookieName: string;
  refreshCookieName: string;
  redirectUri: string;
  syncToMcp?: boolean;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Handle a Google OAuth callback: exchange code for tokens, set cookies,
 * optionally sync to MCP, and redirect to the integrations page.
 */
async function googleAuthCallback(
  req: Request,
  res: Response,
  opts: GoogleCallbackOptions,
): Promise<void> {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) {
    res.redirect(
      `${APP_URL}/integrations?error=${encodeURIComponent(error)}`,
    );
    return;
  }

  if (!code) {
    res.redirect(`${APP_URL}/integrations?error=no_code`);
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect(`${APP_URL}/integrations?error=missing_credentials`);
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: opts.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error(`${opts.provider} token exchange failed:`, errorData);
      res.redirect(`${APP_URL}/integrations?error=token_exchange_failed`);
      return;
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // Express res.cookie maxAge is in milliseconds
    res.cookie(opts.accessCookieName, tokens.access_token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge: tokens.expires_in * 1000,
    });

    if (tokens.refresh_token) {
      res.cookie(opts.refreshCookieName, tokens.refresh_token, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days in ms
      });
    }

    // Sync to MCP credential store (Google integrations only)
    if (opts.syncToMcp !== false) {
      try {
        const syncResponse = await fetch(
          `${AGENT_API_URL}/sync-gmail-credentials`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: tokens.access_token,
              refresh_token: tokens.refresh_token ?? "",
              client_id: clientId,
              client_secret: clientSecret,
              scopes: tokens.scope.split(" "),
            }),
          },
        );

        if (syncResponse.ok) {
          console.log(`✅ ${opts.provider} credentials synced to MCP`);
        } else {
          console.error(
            `⚠️ Failed to sync ${opts.provider} credentials to MCP:`,
            await syncResponse.text(),
          );
        }
      } catch (syncError) {
        console.error(
          `⚠️ Error syncing ${opts.provider} credentials to MCP:`,
          syncError,
        );
        // Don't fail the OAuth flow if sync fails
      }
    }

    res.redirect(`${APP_URL}/integrations?success=${opts.provider}`);
  } catch (err) {
    console.error(`${opts.provider} OAuth error:`, err);
    res.redirect(`${APP_URL}/integrations?error=oauth_failed`);
  }
}

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
].join(" ");

oauthRouter.get("/gmail", (_req, res) => {
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/gmail/callback`;
  googleAuthInit(res, GMAIL_SCOPES, redirectUri);
});

oauthRouter.get("/gmail/callback", async (req, res) => {
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/gmail/callback`;
  await googleAuthCallback(req, res, {
    provider: "gmail",
    accessCookieName: "gmail_access_token",
    refreshCookieName: "gmail_refresh_token",
    redirectUri,
  });
});

// ---------------------------------------------------------------------------
// Google Docs
// ---------------------------------------------------------------------------

const GOOGLE_DOCS_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

oauthRouter.get("/google-docs", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_DOCS_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-docs/callback`;
  googleAuthInit(res, GOOGLE_DOCS_SCOPES, redirectUri);
});

oauthRouter.get("/google-docs/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_DOCS_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-docs/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-docs",
    accessCookieName: "google_docs_access_token",
    refreshCookieName: "google_docs_refresh_token",
    redirectUri,
  });
});

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------

const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

oauthRouter.get("/google-sheets", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-sheets/callback`;
  googleAuthInit(res, GOOGLE_SHEETS_SCOPES, redirectUri);
});

oauthRouter.get("/google-sheets/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-sheets/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-sheets",
    accessCookieName: "google_sheets_access_token",
    refreshCookieName: "google_sheets_refresh_token",
    redirectUri,
  });
});

// ---------------------------------------------------------------------------
// Google Slides
// ---------------------------------------------------------------------------

const GOOGLE_SLIDES_SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/presentations.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

oauthRouter.get("/google-slides", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_SLIDES_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-slides/callback`;
  googleAuthInit(res, GOOGLE_SLIDES_SCOPES, redirectUri);
});

oauthRouter.get("/google-slides/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_SLIDES_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-slides/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-slides",
    accessCookieName: "google_slides_access_token",
    refreshCookieName: "google_slides_refresh_token",
    redirectUri,
  });
});

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

oauthRouter.get("/google-drive", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_DRIVE_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-drive/callback`;
  googleAuthInit(res, GOOGLE_DRIVE_SCOPES, redirectUri);
});

oauthRouter.get("/google-drive/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_DRIVE_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-drive/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-drive",
    accessCookieName: "google_drive_access_token",
    refreshCookieName: "google_drive_refresh_token",
    redirectUri,
  });
});

// ---------------------------------------------------------------------------
// Google Calendar
// ---------------------------------------------------------------------------

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

oauthRouter.get("/google-calendar", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-calendar/callback`;
  googleAuthInit(res, GOOGLE_CALENDAR_SCOPES, redirectUri);
});

oauthRouter.get("/google-calendar/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-calendar/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-calendar",
    accessCookieName: "google_calendar_access_token",
    refreshCookieName: "google_calendar_refresh_token",
    redirectUri,
  });
});

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------

oauthRouter.get("/notion", (_req, res) => {
  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "NOTION_CLIENT_ID not configured" });
    return;
  }

  const redirectUri =
    process.env.NOTION_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/notion/callback`;

  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");

  res.redirect(authUrl.toString());
});

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
}

oauthRouter.get("/notion/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) {
    res.redirect(
      `${APP_URL}/integrations?error=${encodeURIComponent(error)}`,
    );
    return;
  }

  if (!code) {
    res.redirect(`${APP_URL}/integrations?error=no_code`);
    return;
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect(`${APP_URL}/integrations?error=missing_credentials`);
    return;
  }

  const redirectUri =
    process.env.NOTION_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/notion/callback`;

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );

    const tokenResponse = await fetch(
      "https://api.notion.com/v1/oauth/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Notion token exchange failed:", errorData);
      res.redirect(`${APP_URL}/integrations?error=token_exchange_failed`);
      return;
    }

    const tokens: NotionTokenResponse = await tokenResponse.json();

    res.cookie("notion_access_token", tokens.access_token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days in ms
    });

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
  if (!clientId) {
    res.status(500).json({ error: "VERCEL_CLIENT_ID not configured" });
    return;
  }

  const redirectUri =
    process.env.VERCEL_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/vercel/callback`;

  const authUrl = new URL("https://vercel.com/integrations/new");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");

  res.redirect(authUrl.toString());
});

interface VercelTokenResponse {
  access_token: string;
  token_type: string;
  team_id?: string;
  user_id: string;
}

oauthRouter.get("/vercel/callback", async (req, res) => {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) {
    res.redirect(
      `${APP_URL}/integrations?error=${encodeURIComponent(error)}`,
    );
    return;
  }

  if (!code) {
    res.redirect(`${APP_URL}/integrations?error=no_code`);
    return;
  }

  const clientId = process.env.VERCEL_CLIENT_ID;
  const clientSecret = process.env.VERCEL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect(`${APP_URL}/integrations?error=missing_credentials`);
    return;
  }

  const redirectUri =
    process.env.VERCEL_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/vercel/callback`;

  try {
    const tokenResponse = await fetch(
      "https://api.vercel.com/v2/oauth/access_token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Vercel token exchange failed:", errorData);
      res.redirect(`${APP_URL}/integrations?error=token_exchange_failed`);
      return;
    }

    const tokens: VercelTokenResponse = await tokenResponse.json();

    res.cookie("vercel_access_token", tokens.access_token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days in ms
    });

    res.redirect(`${APP_URL}/integrations?success=vercel`);
  } catch (err) {
    console.error("Vercel OAuth error:", err);
    res.redirect(`${APP_URL}/integrations?error=oauth_failed`);
  }
});
