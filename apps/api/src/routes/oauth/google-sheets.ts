import { type IRouter, Router } from "express";

import { API_BASE_URL, googleAuthCallback, googleAuthInit } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleSheetsRouter: IRouter = Router();

googleSheetsRouter.get("/", (req, res) => {
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-sheets/callback`;
  googleAuthInit(req, res, SCOPES, redirectUri);
});

googleSheetsRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_SHEETS_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-sheets/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-sheets",
    service: "google-sheets",
    redirectUri,
  });
});
