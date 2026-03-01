import { Router, type IRouter } from "express";
import { googleAuthInit, googleAuthCallback, API_BASE_URL } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleDocsRouter: IRouter = Router();

googleDocsRouter.get("/", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_DOCS_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-docs/callback`;
  googleAuthInit(res, SCOPES, redirectUri);
});

googleDocsRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_DOCS_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-docs/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-docs",
    accessCookieName: "google_docs_access_token",
    refreshCookieName: "google_docs_refresh_token",
    redirectUri,
  });
});
