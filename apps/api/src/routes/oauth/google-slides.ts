import { type IRouter, Router } from "express";

import { API_BASE_URL, googleAuthCallback, googleAuthInit } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/presentations.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleSlidesRouter: IRouter = Router();

googleSlidesRouter.get("/", (req, res) => {
  const redirectUri =
    process.env.GOOGLE_SLIDES_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-slides/callback`;
  googleAuthInit(req, res, SCOPES, redirectUri);
});

googleSlidesRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_SLIDES_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-slides/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-slides",
    accessCookieName: "google_slides_access_token",
    refreshCookieName: "google_slides_refresh_token",
    redirectUri,
  });
});
