import { type IRouter, Router } from "express";

import { API_BASE_URL, googleAuthCallback, googleAuthInit } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleDriveRouter: IRouter = Router();

googleDriveRouter.get("/", (req, res) => {
  const redirectUri =
    process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-drive/callback`;
  googleAuthInit(req, res, SCOPES, redirectUri);
});

googleDriveRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-drive/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-drive",
    service: "google-drive",
    redirectUri,
  });
});
