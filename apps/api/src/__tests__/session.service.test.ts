import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("@workspace/database", () => ({
  prisma: {
    session: {
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("../services/jwe.service.js", () => ({
  createSessionToken: vi.fn(),
  decryptSessionToken: vi.fn(),
  generateSessionId: vi.fn(),
}));

vi.mock("../utils/cookies.js", () => ({
  cookieConfig: {
    name: "session_token",
    idName: "session_id",
    maxAge: 604800,
    httpOnly: true,
    path: "/",
    secure: false,
    sameSite: "lax" as const,
  },
  setAuthCookies: vi.fn(),
  clearAuthCookies: vi.fn(),
}));

vi.mock("../config/index.js", () => ({
  config: {
    sessionSecret: "test-secret-key-for-testing-32",
    isProduction: false,
    nodeEnv: "test",
    port: 8000,
    appUrl: "http://localhost:3000",
    databaseUrl: "postgresql://test",
    cookieMaxAge: 604800,
    google: {
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
      callbackUrl: "/auth/google/callback",
    },
    notion: {},
    validate: vi.fn(),
  },
  COOKIE_MAX_AGE: 604800,
}));

import { prisma } from "@workspace/database";
import {
  createSessionToken,
  decryptSessionToken,
  generateSessionId,
} from "../services/jwe.service.js";
import { setAuthCookies, clearAuthCookies } from "../utils/cookies.js";
import {
  createSession,
  validateSession,
  destroySession,
  cleanupExpiredSessions,
} from "../services/session.service.js";

const mockPrisma = vi.mocked(prisma);
const mockCreateSessionToken = vi.mocked(createSessionToken);
const mockDecryptSessionToken = vi.mocked(decryptSessionToken);
const mockGenerateSessionId = vi.mocked(generateSessionId);
const mockSetAuthCookies = vi.mocked(setAuthCookies);
const mockClearAuthCookies = vi.mocked(clearAuthCookies);

describe("Session Service", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {
      cookies: {},
    };
    mockRes = {};
  });

  describe("createSession", () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
      image: "https://example.com/avatar.png",
    };

    it("should create a session with correct data", async () => {
      mockGenerateSessionId.mockReturnValue("session-456");
      mockCreateSessionToken.mockResolvedValue("encrypted-token");
      mockPrisma.session.create.mockResolvedValue({
        id: "db-session-id",
        token: "session-456",
        userId: "user-123",
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await createSession(mockUser, mockRes as Response);

      expect(result.token).toBe("encrypted-token");
      expect(result.sessionId).toBe("session-456");
      expect(mockPrisma.session.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          token: "session-456",
          userId: "user-123",
        }),
      });
      expect(mockSetAuthCookies).toHaveBeenCalledWith(
        mockRes,
        "encrypted-token",
        "session-456",
      );
    });

    it("should handle null name and image", async () => {
      const userWithNulls = { ...mockUser, name: null, image: null };
      mockGenerateSessionId.mockReturnValue("session-789");
      mockCreateSessionToken.mockResolvedValue("encrypted-token-2");
      mockPrisma.session.create.mockResolvedValue({
        id: "db-session-id",
        token: "session-789",
        userId: "user-123",
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await createSession(userWithNulls, mockRes as Response);

      expect(result.token).toBe("encrypted-token-2");
      expect(mockCreateSessionToken).toHaveBeenCalledWith(
        expect.objectContaining({
          name: null,
          image: null,
        }),
      );
    });
  });

  describe("validateSession", () => {
    it("should return null when no token cookie exists", async () => {
      const result = await validateSession(mockReq as Request);

      expect(result).toBeNull();
      expect(mockDecryptSessionToken).not.toHaveBeenCalled();
    });

    it("should return null when token decryption fails", async () => {
      mockReq.cookies = { session_token: "invalid-token" };
      mockDecryptSessionToken.mockResolvedValue(null);

      const result = await validateSession(mockReq as Request);

      expect(result).toBeNull();
    });

    it("should return null when token is expired", async () => {
      mockReq.cookies = { session_token: "expired-token" };
      const expiredTime = Math.floor(Date.now() / 1000) - 3600;
      mockDecryptSessionToken.mockResolvedValue({
        userId: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: null,
        sessionId: "session-456",
        iat: expiredTime - 3600,
        exp: expiredTime,
      });

      const result = await validateSession(mockReq as Request);

      expect(result).toBeNull();
    });

    it("should return null when session id mismatch", async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      mockReq.cookies = {
        session_token: "valid-token",
        session_id: "different-session-id",
      };
      mockDecryptSessionToken.mockResolvedValue({
        userId: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: null,
        sessionId: "session-456",
        iat: Math.floor(Date.now() / 1000),
        exp: futureTime,
      });

      const result = await validateSession(mockReq as Request);

      expect(result).toBeNull();
    });

    it("should return user when session is valid", async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      mockReq.cookies = {
        session_token: "valid-token",
        session_id: "session-456",
      };
      mockDecryptSessionToken.mockResolvedValue({
        userId: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
        sessionId: "session-456",
        iat: Math.floor(Date.now() / 1000),
        exp: futureTime,
      });

      const result = await validateSession(mockReq as Request);

      expect(result).toEqual({
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
      });
    });

    it("should validate session without session_id cookie", async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      mockReq.cookies = { session_token: "valid-token" };
      mockDecryptSessionToken.mockResolvedValue({
        userId: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: null,
        sessionId: "session-456",
        iat: Math.floor(Date.now() / 1000),
        exp: futureTime,
      });

      const result = await validateSession(mockReq as Request);

      expect(result).not.toBeNull();
    });
  });

  describe("destroySession", () => {
    it("should delete session from database when session_id exists", async () => {
      mockReq.cookies = { session_id: "session-to-delete" };
      mockPrisma.session.delete.mockResolvedValue({
        id: "db-id",
        token: "session-to-delete",
        userId: "user-123",
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      await destroySession(mockReq as Request, mockRes as Response);

      expect(mockPrisma.session.delete).toHaveBeenCalledWith({
        where: { token: "session-to-delete" },
      });
      expect(mockClearAuthCookies).toHaveBeenCalledWith(mockRes);
    });

    it("should handle case when session does not exist", async () => {
      mockReq.cookies = { session_id: "non-existent-session" };
      mockPrisma.session.delete.mockRejectedValue(new Error("Not found"));

      await destroySession(mockReq as Request, mockRes as Response);

      expect(mockClearAuthCookies).toHaveBeenCalledWith(mockRes);
    });

    it("should clear cookies even when no session_id cookie", async () => {
      mockReq.cookies = {};

      await destroySession(mockReq as Request, mockRes as Response);

      expect(mockPrisma.session.delete).not.toHaveBeenCalled();
      expect(mockClearAuthCookies).toHaveBeenCalledWith(mockRes);
    });
  });

  describe("cleanupExpiredSessions", () => {
    it("should delete expired sessions", async () => {
      mockPrisma.session.deleteMany.mockResolvedValue({ count: 5 });

      await cleanupExpiredSessions();

      expect(mockPrisma.session.deleteMany).toHaveBeenCalledWith({
        where: {
          expiresAt: expect.any(Object),
        },
      });
    });

    it("should handle errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockPrisma.session.deleteMany.mockRejectedValue(new Error("DB error"));

      await cleanupExpiredSessions();

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
