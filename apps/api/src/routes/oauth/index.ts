import { Router, type IRouter } from "express";
import { gmailRouter } from "./gmail.js";
import { googleDocsRouter } from "./google-docs.js";
import { googleSheetsRouter } from "./google-sheets.js";
import { googleSlidesRouter } from "./google-slides.js";
import { googleDriveRouter } from "./google-drive.js";
import { googleCalendarRouter } from "./google-calendar.js";
import { notionRouter } from "./notion.js";
import { vercelRouter } from "./vercel.js";

export const oauthRouter: IRouter = Router();

oauthRouter.use("/gmail", gmailRouter);
oauthRouter.use("/google-docs", googleDocsRouter);
oauthRouter.use("/google-sheets", googleSheetsRouter);
oauthRouter.use("/google-slides", googleSlidesRouter);
oauthRouter.use("/google-drive", googleDriveRouter);
oauthRouter.use("/google-calendar", googleCalendarRouter);
oauthRouter.use("/notion", notionRouter);
oauthRouter.use("/vercel", vercelRouter);
