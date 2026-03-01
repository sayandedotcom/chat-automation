import { Router, type IRouter } from "express";
import { IS_PRODUCTION, API_BASE_URL, APP_URL } from "./helpers.js";

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
}

export const notionRouter: IRouter = Router();

notionRouter.get("/", (_req, res) => {
  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "NOTION_CLIENT_ID not configured" });
    return;
  }

  const redirectUri = process.env.NOTION_REDIRECT_URI ?? `${API_BASE_URL}/oauth/notion/callback`;

  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");

  res.redirect(authUrl.toString());
});

notionRouter.get("/callback", async (req, res) => {
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

  const clientId = process.env.NOTION_CLIENT_ID;
  const clientSecret = process.env.NOTION_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.redirect(`${APP_URL}/integrations?error=missing_credentials`);
    return;
  }

  const redirectUri = process.env.NOTION_REDIRECT_URI ?? `${API_BASE_URL}/oauth/notion/callback`;

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
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
    });

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
