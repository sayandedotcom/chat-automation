import { type IRouter, Router } from "express";

import { API_BASE_URL, googleAuthCallback, googleAuthInit } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export const googleCalendarRouter: IRouter = Router();

googleCalendarRouter.get("/", (req, res) => {
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-calendar/callback`;
  googleAuthInit(req, res, SCOPES, redirectUri);
});

googleCalendarRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ?? `${API_BASE_URL}/oauth/google-calendar/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-calendar",
    service: "google-calendar",
    redirectUri,
  });
});
