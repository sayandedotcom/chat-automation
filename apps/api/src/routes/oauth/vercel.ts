import { Router, type IRouter } from "express";
import { APP_URL, API_BASE_URL, IS_PRODUCTION } from "./helpers.js";

interface VercelTokenResponse {
  access_token: string;
  token_type: string;
  team_id?: string;
  user_id: string;
}

export const vercelRouter: IRouter = Router();

vercelRouter.get("/", (_req, res) => {
  const clientId = process.env.VERCEL_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "VERCEL_CLIENT_ID not configured" });
    return;
  }

  const redirectUri =
    process.env.VERCEL_REDIRECT_URI ?? `${API_BASE_URL}/oauth/vercel/callback`;

  const authUrl = new URL("https://vercel.com/integrations/new");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");

  res.redirect(authUrl.toString());
});

vercelRouter.get("/callback", async (req, res) => {
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

  const clientId = process.env.VERCEL_CLIENT_ID;
  const clientSecret = process.env.VERCEL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect(`${APP_URL}/integrations?error=missing_credentials`);
    return;
  }

  const redirectUri =
    process.env.VERCEL_REDIRECT_URI ?? `${API_BASE_URL}/oauth/vercel/callback`;

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
