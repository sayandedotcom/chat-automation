import type { Response } from "express";
import { config, COOKIE_MAX_AGE } from "../config/index.js";
import type { CookieConfig } from "../@types/index.js";

export const cookieConfig: CookieConfig = {
  name: "session_token",
  idName: "session_id",
  maxAge: COOKIE_MAX_AGE,
  httpOnly: true,
  path: "/",
  secure: config.isProduction,
  sameSite: config.isProduction ? "strict" : "lax",
};

export function setAuthCookies(
  res: Response,
  token: string,
  sessionId: string,
): void {
  res.cookie(cookieConfig.name, token, {
    httpOnly: cookieConfig.httpOnly,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    maxAge: cookieConfig.maxAge * 1000,
    path: cookieConfig.path,
  });

  res.cookie(cookieConfig.idName, sessionId, {
    httpOnly: cookieConfig.httpOnly,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    maxAge: cookieConfig.maxAge * 1000,
    path: cookieConfig.path,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(cookieConfig.name, { path: cookieConfig.path });
  res.clearCookie(cookieConfig.idName, { path: cookieConfig.path });
}
