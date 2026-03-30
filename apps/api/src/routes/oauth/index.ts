import { type IRouter, Router } from "express";

import { requireAuth } from "../../middlewares/auth.middleware.js";
import { gmailRouter } from "./gmail.js";
import { googleCalendarRouter } from "./google-calendar.js";
import { googleDocsRouter } from "./google-docs.js";
import { googleDriveRouter } from "./google-drive.js";
import { googleSheetsRouter } from "./google-sheets.js";
import { googleSlidesRouter } from "./google-slides.js";
import { notionRouter } from "./notion.js";
import { vercelRouter } from "./vercel.js";

export const oauthRouter: IRouter = Router();

oauthRouter.use("/gmail", requireAuth, gmailRouter);
oauthRouter.use("/google-docs", requireAuth, googleDocsRouter);
oauthRouter.use("/google-sheets", requireAuth, googleSheetsRouter);
oauthRouter.use("/google-slides", requireAuth, googleSlidesRouter);
oauthRouter.use("/google-drive", requireAuth, googleDriveRouter);
oauthRouter.use("/google-calendar", requireAuth, googleCalendarRouter);
oauthRouter.use("/notion", notionRouter);
oauthRouter.use("/vercel", vercelRouter);
