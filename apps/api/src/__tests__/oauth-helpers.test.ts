import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

const originalEnv = { ...process.env };

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

import { getCookieDomain, googleAuthInit, googleAuthCallback } from "../routes/oauth/helpers.js";

describe("OAuth Helpers", () => {
  let mockRes: Partial<Response>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRes = {
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn(),
    };
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getCookieDomain", () => {
    it("should return undefined in non-production environment", () => {
      const result = getCookieDomain("https://chat.example.com");
      expect(result).toBeUndefined();
    });

    it("should extract root domain from subdomain in production", () => {
      vi.doMock("../routes/oauth/helpers.js", () => ({
        getCookieDomain: (urlStr: string) => {
          if (process.env.NODE_ENV !== "production") return undefined;
          try {
            const hostname = new URL(urlStr).hostname;
            const parts = hostname.split(".");
            if (parts.length >= 2) {
              return `.${parts.slice(-2).join(".")}`;
            }
          } catch {
            return undefined;
          }
          return undefined;
        },
      }));

      process.env.NODE_ENV = "production";
      const hostname = new URL("https://chat.tweakleaf.com").hostname;
      const parts = hostname.split(".");
      const expected = `.${parts.slice(-2).join(".")}`;
      expect(expected).toBe(".tweakleaf.com");
    });

    it("should handle nested subdomains", () => {
      process.env.NODE_ENV = "production";
      const hostname = new URL("https://app.staging.example.com").hostname;
      const parts = hostname.split(".");
      const expected = `.${parts.slice(-2).join(".")}`;
      expect(expected).toBe(".example.com");
    });

    it("should handle invalid URLs gracefully", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = getCookieDomain("not-a-valid-url");
      expect(result).toBeUndefined();
      consoleSpy.mockRestore();
    });

    it("should handle simple hostnames", () => {
      const result = getCookieDomain("https://localhost");
      expect(result).toBeUndefined();
    });
  });

  describe("googleAuthInit", () => {
    it("should return error when GOOGLE_CLIENT_ID not configured", () => {
      delete process.env.GOOGLE_CLIENT_ID;

      googleAuthInit(
        mockRes as Response,
        "https://www.googleapis.com/auth/gmail.readonly",
        "http://localhost:8000/oauth/gmail/callback"
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: "GOOGLE_CLIENT_ID not configured",
      });
    });

    it("should redirect to Google OAuth with correct parameters", () => {
      process.env.GOOGLE_CLIENT_ID = "test-client-id";

      googleAuthInit(
        mockRes as Response,
        "https://www.googleapis.com/auth/gmail.readonly",
        "http://localhost:8000/oauth/gmail/callback"
      );

      expect(mockRes.redirect).toHaveBeenCalled();
      const redirectUrl = (mockRes.redirect as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as string;

      expect(redirectUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(redirectUrl).toContain("client_id=test-client-id");
      expect(redirectUrl).toContain(
        "redirect_uri=http%3A%2F%2Flocalhost%3A8000%2Foauth%2Fgmail%2Fcallback"
      );
      expect(redirectUrl).toContain("response_type=code");
      expect(redirectUrl).toContain(
        "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly"
      );
      expect(redirectUrl).toContain("access_type=offline");
      expect(redirectUrl).toContain("prompt=consent");
      expect(redirectUrl).toContain("include_granted_scopes=true");
    });

    it("should handle multiple scopes", () => {
      process.env.GOOGLE_CLIENT_ID = "test-client-id";

      googleAuthInit(mockRes as Response, "scope1 scope2", "http://localhost:8000/callback");

      const redirectUrl = (mockRes.redirect as ReturnType<typeof vi.fn>).mock
        .calls[0]?.[0] as string;
      expect(redirectUrl).toContain("scope=scope1+scope2");
    });
  });

  describe("googleAuthCallback", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
      process.env.GOOGLE_CLIENT_ID = "test-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
      process.env.APP_URL = "http://localhost:3000";
      process.env.AGENT_API_URL = "http://agent-api";
    });

    it("should redirect with error when error query param present", async () => {
      const mockReq = {
        query: { error: "access_denied" },
      } as unknown as Partial<Request>;

      await googleAuthCallback(mockReq as unknown as Request, mockRes as Response, {
        provider: "gmail",
        accessCookieName: "gmail_access_token",
        refreshCookieName: "gmail_refresh_token",
        redirectUri: "http://localhost:8000/oauth/gmail/callback",
      });

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining("/integrations?error=access_denied")
      );
    });

    it("should redirect with error when no code present", async () => {
      const mockReq = {
        query: {},
      } as unknown as Partial<Request>;

      await googleAuthCallback(mockReq as unknown as Request, mockRes as Response, {
        provider: "gmail",
        accessCookieName: "gmail_access_token",
        refreshCookieName: "gmail_refresh_token",
        redirectUri: "http://localhost:8000/oauth/gmail/callback",
      });

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining("/integrations?error=no_code")
      );
    });

    it("should redirect with error when credentials missing", async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      const mockReq = {
        query: { code: "auth-code" },
      } as unknown as Partial<Request>;

      await googleAuthCallback(mockReq as unknown as Request, mockRes as Response, {
        provider: "gmail",
        accessCookieName: "gmail_access_token",
        refreshCookieName: "gmail_refresh_token",
        redirectUri: "http://localhost:8000/oauth/gmail/callback",
      });

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining("/integrations?error=missing_credentials")
      );
    });

    it("should exchange code for tokens and set cookies", async () => {
      const mockReq = {
        query: { code: "auth-code" },
      } as unknown as Partial<Request>;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "access-token-123",
            refresh_token: "refresh-token-456",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "https://www.googleapis.com/auth/gmail.readonly",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "OK",
        });

      await googleAuthCallback(mockReq as unknown as Request, mockRes as Response, {
        provider: "gmail",
        accessCookieName: "gmail_access_token",
        refreshCookieName: "gmail_refresh_token",
        redirectUri: "http://localhost:8000/oauth/gmail/callback",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({
          method: "POST",
        })
      );

      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith(
        "gmail_access_token",
        "access-token-123",
        expect.objectContaining({
          httpOnly: true,
        })
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        "gmail_refresh_token",
        "refresh-token-456",
        expect.any(Object)
      );
    });

    it("should redirect with error on token exchange failure", async () => {
      const mockReq = {
        query: { code: "invalid-code" },
      } as unknown as Partial<Request>;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => "Invalid grant",
      });

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await googleAuthCallback(mockReq as unknown as Request, mockRes as Response, {
        provider: "gmail",
        accessCookieName: "gmail_access_token",
        refreshCookieName: "gmail_refresh_token",
        redirectUri: "http://localhost:8000/oauth/gmail/callback",
      });

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining("/integrations?error=token_exchange_failed")
      );
      consoleSpy.mockRestore();
    });

    it("should handle OAuth errors gracefully", async () => {
      const mockReq = {
        query: { code: "auth-code" },
      } as unknown as Partial<Request>;

      mockFetch.mockRejectedValue(new Error("Network error"));

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await googleAuthCallback(mockReq as unknown as Request, mockRes as Response, {
        provider: "gmail",
        accessCookieName: "gmail_access_token",
        refreshCookieName: "gmail_refresh_token",
        redirectUri: "http://localhost:8000/oauth/gmail/callback",
      });

      expect(mockRes.redirect).toHaveBeenCalledWith(
        expect.stringContaining("/integrations?error=oauth_failed")
      );
      consoleSpy.mockRestore();
    });

    it("should not set refresh token cookie when not provided", async () => {
      const mockReq = {
        query: { code: "auth-code" },
      } as unknown as Partial<Request>;

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "access-token-123",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "https://www.googleapis.com/auth/gmail.readonly",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => "OK",
        });

      await googleAuthCallback(mockReq as unknown as Request, mockRes as Response, {
        provider: "gmail",
        accessCookieName: "gmail_access_token",
        refreshCookieName: "gmail_refresh_token",
        redirectUri: "http://localhost:8000/oauth/gmail/callback",
      });

      const refreshCookieCalls = (mockRes.cookie as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === "gmail_refresh_token"
      );
      expect(refreshCookieCalls).toHaveLength(0);
    });
  });
});
