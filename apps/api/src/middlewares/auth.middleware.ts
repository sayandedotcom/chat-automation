import type { NextFunction, Request, Response } from "express";

import { validateSession } from "../services/session.service.js";

export function sessionMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await validateSession(req);
      req.user = user ?? undefined;
      next();
    } catch (error) {
      console.error("[Middleware] Session validation error:", error);
      req.user = undefined;
      next();
    }
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: "Unauthorized",
      message: "Authentication required",
    });
  }
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  next();
}
