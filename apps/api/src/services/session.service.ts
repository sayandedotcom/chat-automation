import { prisma } from "@workspace/database";
import type { Request, Response } from "express";
import {
  createSessionToken,
  decryptSessionToken,
  generateSessionId,
} from "./jwe.service.js";
import {
  cookieConfig,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/cookies.js";
import { COOKIE_MAX_AGE } from "../config/index.js";
import type { SessionUser } from "../@types/index.js";

export async function createSession(
  user: SessionUser,
  res: Response,
): Promise<{ token: string; sessionId: string }> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE * 1000);

  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    sessionId,
  });

  await prisma.session.create({
    data: {
      token: sessionId,
      userId: user.id,
      expiresAt,
    },
  });

  setAuthCookies(res, token, sessionId);

  return { token, sessionId };
}

export async function validateSession(
  req: Request,
): Promise<SessionUser | null> {
  const token = req.cookies?.[cookieConfig.name];
  const sessionId = req.cookies?.[cookieConfig.idName];

  if (!token) {
    return null;
  }

  const payload = await decryptSessionToken(token);
  if (!payload) {
    return null;
  }

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (sessionId && sessionId !== payload.sessionId) {
    return null;
  }

  return {
    id: payload.userId,
    email: payload.email,
    name: payload.name,
    image: payload.image,
  };
}

export async function destroySession(
  req: Request,
  res: Response,
): Promise<void> {
  const sessionId = req.cookies?.[cookieConfig.idName];

  if (sessionId) {
    try {
      await prisma.session.delete({
        where: { token: sessionId },
      });
    } catch {
      // Session might not exist, ignore
    }
  }

  clearAuthCookies(res);
}

export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await prisma.session.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
  } catch (error) {
    console.error("[Session] Cleanup error:", error);
  }
}
