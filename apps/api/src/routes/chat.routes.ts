import { Router, type IRouter } from "express";
import { chatExpressRouter } from "./chat.js";

export const chatRouter: IRouter = Router();
chatRouter.use("/", chatExpressRouter);
