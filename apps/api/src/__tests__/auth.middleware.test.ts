import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../services/session.service.js", () => ({
  validateSession: vi.fn(),
}));

import { validateSession } from "../services/session.service.js";
import { sessionMiddleware, requireAuth, optionalAuth } from "../middlewares/auth.middleware.js";

const mockValidateSession = vi.mocked(validateSession);

describe("Auth Middleware", () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReq = {};
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  describe("sessionMiddleware", () => {
    it("should set req.user when session is valid", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
      };
      mockValidateSession.mockResolvedValue(mockUser);

      const middleware = sessionMiddleware();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it("should set req.user to undefined when session is invalid", async () => {
      mockValidateSession.mockResolvedValue(null);

      const middleware = sessionMiddleware();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it("should set req.user to undefined on error", async () => {
      mockValidateSession.mockRejectedValue(new Error("Session error"));

      const middleware = sessionMiddleware();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockReq.user).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it("should always call next()", async () => {
      mockValidateSession.mockResolvedValue(null);

      const middleware = sessionMiddleware();
      await middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe("requireAuth", () => {
    it("should call next() when user is authenticated", () => {
      mockReq.user = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: null,
      };

      requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should return 401 when user is not authenticated", () => {
      mockReq.user = undefined;

      requireAuth(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "Unauthorized",
        message: "Authentication required",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe("optionalAuth", () => {
    it("should always call next()", () => {
      optionalAuth(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it("should call next() even when user is not set", () => {
      mockReq.user = undefined;
      optionalAuth(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it("should call next() when user is set", () => {
      mockReq.user = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: null,
      };
      optionalAuth(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
