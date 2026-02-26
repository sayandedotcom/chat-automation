import type { Request, Response, NextFunction } from "express";
import passport from "passport";
import { config } from "../config/index.js";
import { createSession, destroySession } from "../services/session.service.js";
import type { SessionUser } from "../@types/index.js";

export function googleLogin(req: Request, res: Response, next: NextFunction) {
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  })(req, res, next);
}

export function googleCallback(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  passport.authenticate(
    "google",
    { session: false },
    async (err: Error | null, user: SessionUser | false) => {
      if (err || !user) {
        return res.redirect(`${config.appUrl}/?error=oauth_failed`);
      }

      try {
        await createSession(user, res);
        res.redirect(`${config.appUrl}/chat`);
      } catch (sessionErr) {
        console.error("[Auth] Session creation error:", sessionErr);
        res.redirect(`${config.appUrl}/?error=session_failed`);
      }
    },
  )(req, res, next);
}

export async function logout(req: Request, res: Response) {
  try {
    await destroySession(req, res);
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("[Auth] Logout error:", error);
    res.status(500).json({ success: false, message: "Logout failed" });
  }
}

export function getCurrentUser(req: Request, res: Response) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      image: req.user.image,
    },
  });
}

export function getAuthStatus(req: Request, res: Response) {
  res.json({
    authenticated: !!req.user,
    user: req.user
      ? {
          id: req.user.id,
          email: req.user.email,
          name: req.user.name,
          image: req.user.image,
        }
      : null,
  });
}
