import { type IRouter, Router } from "express";

import { chatExpressRouter } from "./chat.js";

export const chatRouter: IRouter = Router();
chatRouter.use("/", chatExpressRouter);
