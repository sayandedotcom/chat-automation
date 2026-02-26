import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";

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

import {
  cookieConfig,
  setAuthCookies,
  clearAuthCookies,
} from "../utils/cookies.js";

describe("Cookies Utils", () => {
  let mockRes: Partial<Response>;
  let cookieMock: ReturnType<typeof vi.fn>;
  let clearCookieMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cookieMock = vi.fn();
    clearCookieMock = vi.fn();
    mockRes = {
      cookie: cookieMock,
      clearCookie: clearCookieMock,
    } as unknown as Partial<Response>;
  });

  describe("cookieConfig", () => {
    it("should have correct cookie name", () => {
      expect(cookieConfig.name).toBe("session_token");
    });

    it("should have correct session id cookie name", () => {
      expect(cookieConfig.idName).toBe("session_id");
    });

    it("should have correct max age (7 days in seconds)", () => {
      expect(cookieConfig.maxAge).toBe(604800);
    });

    it("should have httpOnly set to true", () => {
      expect(cookieConfig.httpOnly).toBe(true);
    });

    it("should have path set to root", () => {
      expect(cookieConfig.path).toBe("/");
    });

    it("should have secure set based on environment (false in test)", () => {
      expect(cookieConfig.secure).toBe(false);
    });

    it("should have sameSite as lax in non-production", () => {
      expect(cookieConfig.sameSite).toBe("lax");
    });
  });

  describe("setAuthCookies", () => {
    it("should set both session token and session id cookies", () => {
      setAuthCookies(mockRes as Response, "test-token", "test-session-id");

      expect(cookieMock).toHaveBeenCalledTimes(2);
    });

    it("should set session_token cookie with correct options", () => {
      setAuthCookies(mockRes as Response, "test-token", "test-session-id");

      expect(cookieMock).toHaveBeenCalledWith(
        "session_token",
        "test-token",
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
          maxAge: 604800000,
        }),
      );
    });

    it("should set session_id cookie with correct options", () => {
      setAuthCookies(mockRes as Response, "test-token", "test-session-id");

      expect(cookieMock).toHaveBeenCalledWith(
        "session_id",
        "test-session-id",
        expect.objectContaining({
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          path: "/",
          maxAge: 604800000,
        }),
      );
    });

    it("should convert maxAge from seconds to milliseconds", () => {
      setAuthCookies(mockRes as Response, "token", "id");

      const call = cookieMock.mock.calls[0];
      expect(call[2].maxAge).toBe(cookieConfig.maxAge * 1000);
    });
  });

  describe("clearAuthCookies", () => {
    it("should clear both session token and session id cookies", () => {
      clearAuthCookies(mockRes as Response);

      expect(clearCookieMock).toHaveBeenCalledTimes(2);
    });

    it("should clear session_token cookie with correct path", () => {
      clearAuthCookies(mockRes as Response);

      expect(clearCookieMock).toHaveBeenCalledWith("session_token", {
        path: "/",
      });
    });

    it("should clear session_id cookie with correct path", () => {
      clearAuthCookies(mockRes as Response);

      expect(clearCookieMock).toHaveBeenCalledWith("session_id", {
        path: "/",
      });
    });
  });
});
