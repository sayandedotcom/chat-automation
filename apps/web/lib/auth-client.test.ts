import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SessionData,
  type User,
  authClient,
  clearSessionCache,
  signIn,
  useSession,
} from "./auth-client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("auth-client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSessionCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("authClient.signInWithGoogle", () => {
    it("should redirect to Google OAuth URL without callback", () => {
      const originalLocation = window.location;
      const mockLocation = { href: "" };
      Object.defineProperty(window, "location", {
        value: mockLocation,
        writable: true,
      });

      authClient.signInWithGoogle();

      expect(mockLocation.href).toContain("/auth/google");
      expect(mockLocation.href).not.toContain("callbackURL");

      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("should redirect to Google OAuth URL with callback", () => {
      const originalLocation = window.location;
      const mockLocation = { href: "" };
      Object.defineProperty(window, "location", {
        value: mockLocation,
        writable: true,
      });

      authClient.signInWithGoogle("/chat");

      expect(mockLocation.href).toContain("/auth/google");
      expect(mockLocation.href).toContain("callbackURL");
      expect(mockLocation.href).toContain(encodeURIComponent("/chat"));

      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });
  });

  describe("authClient.signOut", () => {
    it("should call logout endpoint", async () => {
      const mockResponse = { success: true, message: "Logged out" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await authClient.signOut();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/logout"),
        expect.objectContaining({ method: "POST" })
      );
      expect(result).toEqual(mockResponse);
    });

    it("should include credentials in request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await authClient.signOut();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ credentials: "include" })
      );
    });
  });

  describe("authClient.getStatus", () => {
    it("should return authenticated status", async () => {
      const mockUser: User = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: "https://example.com/avatar.png",
        emailVerified: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: true,
            user: mockUser,
          }),
      });

      const result = await authClient.getStatus();

      expect(result.authenticated).toBe(true);
      expect(result.user).toEqual(mockUser);
    });

    it("should return unauthenticated status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: false,
            user: null,
          }),
      });

      const result = await authClient.getStatus();

      expect(result.authenticated).toBe(false);
      expect(result.user).toBeNull();
    });
  });

  describe("authClient.getMe", () => {
    it("should return current user", async () => {
      const mockUser: User = {
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        image: null,
        emailVerified: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      });

      const result = await authClient.getMe();

      expect(result.user).toEqual(mockUser);
    });
  });

  describe("signIn", () => {
    it("should call signInWithGoogle for Google provider", () => {
      const originalLocation = window.location;
      const mockLocation = { href: "" };
      Object.defineProperty(window, "location", {
        value: mockLocation,
        writable: true,
      });

      signIn.social({ provider: "google" });

      expect(mockLocation.href).toContain("/auth/google");

      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });

    it("should pass callbackURL to signInWithGoogle", () => {
      const originalLocation = window.location;
      const mockLocation = { href: "" };
      Object.defineProperty(window, "location", {
        value: mockLocation,
        writable: true,
      });

      signIn.social({ provider: "google", callbackURL: "/dashboard" });

      expect(mockLocation.href).toContain("callbackURL");

      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
      });
    });
  });

  describe("useSession", () => {
    it("should export useSession hook", () => {
      expect(useSession).toBeDefined();
      expect(typeof useSession).toBe("function");
    });
  });

  describe("clearSessionCache", () => {
    it("should clear the session cache", () => {
      clearSessionCache();
    });
  });
});

describe("User type", () => {
  it("should allow null name and image", () => {
    const user: User = {
      id: "1",
      email: "test@example.com",
      name: null,
      image: null,
      emailVerified: false,
    };

    expect(user.name).toBeNull();
    expect(user.image).toBeNull();
  });
});

describe("SessionData type", () => {
  it("should have correct structure", () => {
    const session: SessionData = {
      user: {
        id: "1",
        email: "test@example.com",
        name: "Test",
        image: null,
        emailVerified: true,
      },
      session: {
        id: "session-1",
        expiresAt: new Date(),
      },
    };

    expect(session.user).toBeDefined();
    expect(session.session).toBeDefined();
  });
});
