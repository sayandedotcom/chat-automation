import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("passport", () => ({
  default: {
    authenticate: vi.fn(),
  },
}));

vi.mock("../services/session.service.js", () => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
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

import passport from "passport";
import { createSession, destroySession } from "../services/session.service.js";
import {
  googleLogin,
  googleCallback,
  logout,
  getCurrentUser,
  getAuthStatus,
} from "../controllers/auth.controller.js";

const mockPassport = vi.mocked(passport);
const mockCreateSession = vi.mocked(createSession);
const mockDestroySession = vi.mocked(destroySession);

describe("Auth Controller", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {};
    mockRes = {
      redirect: vi.fn(),
      json: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe("googleLogin", () => {
    it("should call passport authenticate with google strategy", () => {
      const mockAuthenticate = vi.fn();
      mockPassport.authenticate.mockReturnValue(mockAuthenticate);

      googleLogin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockPassport.authenticate).toHaveBeenCalledWith("google", {
        scope: ["profile", "email"],
        session: false,
      });
      expect(mockAuthenticate).toHaveBeenCalledWith(mockReq, mockRes, mockNext);
    });
  });

  describe("googleCallback", () => {
    it("should redirect to error page on authentication failure", async () => {
      const mockAuthenticateFn = vi.fn(
        (
          strategy: string,
          options: object,
          callback: (err: Error | null, user: unknown) => void
        ) => {
          return (_req: Request, _res: Response, _next: NextFunction) => {
            callback(new Error("Auth failed"), false);
          };
        }
      );
      mockPassport.authenticate.mockImplementation(mockAuthenticateFn);

      await googleCallback(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith("http://localhost:3000/?error=oauth_failed");
    });

    it("should redirect to error page when no user returned", async () => {
      const mockAuthenticateFn = vi.fn(
        (
          strategy: string,
          options: object,
          callback: (err: Error | null, user: unknown) => void
        ) => {
          return (req: Request, res: Response, next: NextFunction) => {
            callback(null, false);
          };
        }
      );
      mockPassport.authenticate.mockImplementation(mockAuthenticateFn);

      await googleCallback(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith("http://localhost:3000/?error=oauth_failed");
    });

    it("should create session and redirect to chat on success", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
      };
      const mockAuthenticateFn = vi.fn(
        (
          strategy: string,
          options: object,
          callback: (err: Error | null, user: unknown) => void
        ) => {
          return (req: Request, res: Response, next: NextFunction) => {
            callback(null, mockUser);
          };
        }
      );
      mockPassport.authenticate.mockImplementation(mockAuthenticateFn);
      mockCreateSession.mockResolvedValue({
        token: "session-token",
        sessionId: "session-123",
      });

      await googleCallback(mockReq as Request, mockRes as Response, mockNext);

      expect(mockCreateSession).toHaveBeenCalledWith(mockUser, mockRes);
      expect(mockRes.redirect).toHaveBeenCalledWith("http://localhost:3000/chat");
    });

    it("should redirect to error page on session creation failure", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
      };
      const mockAuthenticateFn = vi.fn(
        (
          strategy: string,
          options: object,
          callback: (err: Error | null, user: unknown) => void
        ) => {
          return (req: Request, res: Response, next: NextFunction) => {
            callback(null, mockUser);
          };
        }
      );
      mockPassport.authenticate.mockImplementation(mockAuthenticateFn);
      mockCreateSession.mockRejectedValue(new Error("Session error"));

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await googleCallback(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.redirect).toHaveBeenCalledWith("http://localhost:3000/?error=session_failed");
      consoleSpy.mockRestore();
    });
  });

  describe("logout", () => {
    it("should destroy session and return success", async () => {
      mockDestroySession.mockResolvedValue();

      await logout(mockReq as Request, mockRes as Response);

      expect(mockDestroySession).toHaveBeenCalledWith(mockReq, mockRes);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        message: "Logged out successfully",
      });
    });

    it("should return error on logout failure", async () => {
      mockDestroySession.mockRejectedValue(new Error("Logout failed"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await logout(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: "Logout failed",
      });
      consoleSpy.mockRestore();
    });
  });

  describe("getCurrentUser", () => {
    it("should return 401 when not authenticated", () => {
      mockReq.user = undefined;

      getCurrentUser(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: "Not authenticated" });
    });

    it("should return user data when authenticated", () => {
      mockReq.user = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
      };

      getCurrentUser(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          image: "https://example.com/avatar.png",
        },
      });
    });

    it("should handle null name and image", () => {
      mockReq.user = {
        id: "user-456",
        email: "test2@example.com",
        name: null,
        image: null,
      };

      getCurrentUser(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        user: {
          id: "user-456",
          email: "test2@example.com",
          name: null,
          image: null,
        },
      });
    });
  });

  describe("getAuthStatus", () => {
    it("should return unauthenticated status when no user", () => {
      mockReq.user = undefined;

      getAuthStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        authenticated: false,
        user: null,
      });
    });

    it("should return authenticated status with user data", () => {
      mockReq.user = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
      };

      getAuthStatus(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({
        authenticated: true,
        user: {
          id: "user-123",
          email: "test@example.com",
          name: "Test User",
          image: "https://example.com/avatar.png",
        },
      });
    });
  });
});
