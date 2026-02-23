import type { Request, Response } from "express";

export const APP_URL = process.env.APP_URL as string;
export const AGENT_API_URL = process.env.AGENT_API_URL as string;
export const API_BASE_URL = process.env.API_BASE_URL as string;
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * Extracts the root domain for cross-subdomain cookie sharing in production.
 * e.g., 'https://chat.tweakleaf.com' -> '.tweakleaf.com'
 */
export function getCookieDomain(urlStr: string): string | undefined {
  if (!IS_PRODUCTION) return undefined;

  try {
    const hostname = new URL(urlStr).hostname;
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      return `.${parts.slice(-2).join(".")}`;
    }
  } catch (e) {
    console.error("Failed to parse cookie domain from APP_URL", e);
  }
  return undefined;
}

/**
 * Build a Google OAuth consent URL and redirect the user to it.
 */
export function googleAuthInit(
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

export interface GoogleCallbackOptions {
  provider: string;
  accessCookieName: string;
  refreshCookieName: string;
  redirectUri: string;
}

/**
 * Handle a Google OAuth callback: exchange code for tokens, set cookies,
 * sync to MCP, and redirect to the integrations page.
 */
export async function googleAuthCallback(
  req: Request,
  res: Response,
  opts: GoogleCallbackOptions,
): Promise<void> {
  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) {
    res.redirect(`${APP_URL}/integrations?error=${encodeURIComponent(error)}`);
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

    const domain = getCookieDomain(APP_URL);

    // Express res.cookie maxAge is in milliseconds
    res.cookie(opts.accessCookieName, tokens.access_token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge: tokens.expires_in * 1000,
      domain,
    });

    if (tokens.refresh_token) {
      res.cookie(opts.refreshCookieName, tokens.refresh_token, {
        httpOnly: true,
        secure: IS_PRODUCTION,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30 * 1000, // 30 days in ms
        domain,
      });
    }

    // Sync to MCP credential store
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

    res.redirect(`${APP_URL}/integrations?success=${opts.provider}`);
  } catch (err) {
    console.error(`${opts.provider} OAuth error:`, err);
    res.redirect(`${APP_URL}/integrations?error=oauth_failed`);
  }
}
