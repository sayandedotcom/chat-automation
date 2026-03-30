import { type IRouter, Router } from "express";

import { API_BASE_URL, googleAuthCallback, googleAuthInit } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
].join(" ");

export const googleDocsRouter: IRouter = Router();

googleDocsRouter.get("/", (req, res) => {
  const redirectUri =
    process.env.GOOGLE_DOCS_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-docs/callback`;
  googleAuthInit(req, res, SCOPES, redirectUri);
});

googleDocsRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_DOCS_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-docs/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-docs",
    service: "google-docs",
    redirectUri,
  });
});
