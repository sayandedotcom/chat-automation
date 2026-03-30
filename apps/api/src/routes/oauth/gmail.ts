import { type IRouter, Router } from "express";

import { API_BASE_URL, googleAuthCallback, googleAuthInit } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
].join(" ");

export const gmailRouter: IRouter = Router();

gmailRouter.get("/", (req, res) => {
  const redirectUri = process.env.GMAIL_REDIRECT_URI ?? `${API_BASE_URL}/oauth/gmail/callback`;
  googleAuthInit(req, res, SCOPES, redirectUri);
});

gmailRouter.get("/callback", async (req, res) => {
  const redirectUri = process.env.GMAIL_REDIRECT_URI ?? `${API_BASE_URL}/oauth/gmail/callback`;
  await googleAuthCallback(req, res, {
    provider: "gmail",
    service: "gmail",
    redirectUri,
  });
});
