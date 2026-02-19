import { Router, type IRouter } from "express";
import { googleAuthInit, googleAuthCallback, API_BASE_URL } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleSheetsRouter: IRouter = Router();

googleSheetsRouter.get("/", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-sheets/callback`;
  googleAuthInit(res, SCOPES, redirectUri);
});

googleSheetsRouter.get("/callback", async (req, res) => {
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
