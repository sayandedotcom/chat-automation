import { type IRouter, Router } from "express";

import { gmailRouter } from "./oauth/gmail.js";
import { googleCalendarRouter } from "./oauth/google-calendar.js";
import { googleDocsRouter } from "./oauth/google-docs.js";
import { googleDriveRouter } from "./oauth/google-drive.js";
import { googleSheetsRouter } from "./oauth/google-sheets.js";
import { googleSlidesRouter } from "./oauth/google-slides.js";
import { notionRouter } from "./oauth/notion.js";
import { vercelRouter } from "./oauth/vercel.js";

export const oauthRouter: IRouter = Router();

oauthRouter.use("/gmail", gmailRouter);
oauthRouter.use("/google-docs", googleDocsRouter);
oauthRouter.use("/google-sheets", googleSheetsRouter);
oauthRouter.use("/google-slides", googleSlidesRouter);
oauthRouter.use("/google-drive", googleDriveRouter);
oauthRouter.use("/google-calendar", googleCalendarRouter);
oauthRouter.use("/notion", notionRouter);
oauthRouter.use("/vercel", vercelRouter);
