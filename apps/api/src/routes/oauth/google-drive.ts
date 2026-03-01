import { Router, type IRouter } from "express";
import { googleAuthInit, googleAuthCallback, API_BASE_URL } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleDriveRouter: IRouter = Router();

googleDriveRouter.get("/", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-drive/callback`;
  googleAuthInit(res, SCOPES, redirectUri);
});

googleDriveRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_DRIVE_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-drive/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-drive",
    accessCookieName: "google_drive_access_token",
    refreshCookieName: "google_drive_refresh_token",
    redirectUri,
  });
});
