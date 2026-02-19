import { Router, type IRouter } from "express";
import { googleAuthInit, googleAuthCallback, API_BASE_URL } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
].join(" ");

export const gmailRouter: IRouter = Router();

gmailRouter.get("/", (_req, res) => {
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI ?? `${API_BASE_URL}/oauth/gmail/callback`;
  googleAuthInit(res, SCOPES, redirectUri);
});

gmailRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI ?? `${API_BASE_URL}/oauth/gmail/callback`;
  await googleAuthCallback(req, res, {
    provider: "gmail",
    accessCookieName: "gmail_access_token",
    refreshCookieName: "gmail_refresh_token",
    redirectUri,
  });
});
