import { Router, type IRouter } from "express";
import { googleAuthInit, googleAuthCallback, API_BASE_URL } from "./helpers.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export const googleCalendarRouter: IRouter = Router();

googleCalendarRouter.get("/", (_req, res) => {
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-calendar/callback`;
  googleAuthInit(res, SCOPES, redirectUri);
});

googleCalendarRouter.get("/callback", async (req, res) => {
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ??
    `${API_BASE_URL}/oauth/google-calendar/callback`;
  await googleAuthCallback(req, res, {
    provider: "google-calendar",
    accessCookieName: "google_calendar_access_token",
    refreshCookieName: "google_calendar_refresh_token",
    redirectUri,
  });
});
