import type { Request, Response } from "express";

import { upsertGoogleIntegration } from "@workspace/trpc/lib/google-integration-utils";

export const APP_URL = process.env.APP_URL as string;
export const AGENT_API_URL = process.env.AGENT_API_URL as string;
export const API_BASE_URL = process.env.API_BASE_URL as string;
export const IS_PRODUCTION = process.env.NODE_ENV === "production";

const GOOGLE_IDENTITY_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

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
  req: Request,
  res: Response,
  scopes: string,
  redirectUri: string
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
  authUrl.searchParams.set(
    "scope",
    Array.from(new Set([...scopes.split(" "), ...GOOGLE_IDENTITY_SCOPES])).join(" ")
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");

  const returnTo = req.query["returnTo"] as string | undefined;
  if (returnTo) {
    authUrl.searchParams.set("state", returnTo);
  }

  res.redirect(authUrl.toString());
}

export interface GoogleCallbackOptions {
  provider: string;
  service:
    | "gmail"
    | "google-docs"
    | "google-sheets"
    | "google-slides"
    | "google-drive"
    | "google-calendar";
  redirectUri: string;
}

interface GoogleUserInfoResponse {
  email?: string;
}

async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfoResponse | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

/**
 * Handle a Google OAuth callback: exchange code for tokens, set cookies,
 * sync to MCP, and redirect to the integrations page.
 */
export async function googleAuthCallback(
  req: Request,
  res: Response,
  opts: GoogleCallbackOptions
): Promise<void> {
  const appUrl = process.env.APP_URL ?? APP_URL;

  if (!req.user?.id || !req.user.email) {
    res.redirect(`${appUrl}/integrations/callback?error=unauthorized`);
    return;
  }

  const code = req.query["code"] as string | undefined;
  const error = req.query["error"] as string | undefined;

  if (error) {
    res.redirect(`${appUrl}/integrations/callback?error=${encodeURIComponent(error)}`);
    return;
  }

  if (!code) {
    res.redirect(`${appUrl}/integrations/callback?error=no_code`);
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect(`${appUrl}/integrations/callback?error=missing_credentials`);
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
      res.redirect(`${appUrl}/integrations/callback?error=token_exchange_failed`);
      return;
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    const userInfo = await getGoogleUserInfo(tokens.access_token);
    const connectedEmail = userInfo?.email?.trim().toLowerCase();
    const sessionEmail = req.user.email.trim().toLowerCase();

    if (!connectedEmail || connectedEmail !== sessionEmail) {
      res.redirect(`${appUrl}/integrations/callback?error=account_mismatch`);
      return;
    }

    await upsertGoogleIntegration({
      userId: req.user.id,
      service: opts.service,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      scopes: tokens.scope.split(" "),
      accountEmail: connectedEmail,
      expiresInSeconds: tokens.expires_in,
    });

    const returnTo = req.query["state"] as string | undefined;
    const callbackUrl = new URL(`${appUrl}/integrations/callback`);
    callbackUrl.searchParams.set("provider", opts.provider);
    if (returnTo) {
      callbackUrl.searchParams.set("returnTo", returnTo);
    }
    res.redirect(callbackUrl.toString());
  } catch (err) {
    console.error(`${opts.provider} OAuth error:`, err);
    res.redirect(`${appUrl}/integrations/callback?error=oauth_failed`);
  }
}
