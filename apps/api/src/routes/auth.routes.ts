import { type IRouter, Router } from "express";

import {
  getAuthStatus,
  getCurrentUser,
  googleCallback,
  googleLogin,
  logout,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export const authRouter: IRouter = Router();

authRouter.get("/google", googleLogin);
authRouter.get("/google/callback", googleCallback);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, getCurrentUser);
authRouter.get("/status", getAuthStatus);
