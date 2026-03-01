import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };

describe("Config", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe("validateEnv", () => {
    it("should throw error when DATABASE_URL is missing", async () => {
      delete process.env.DATABASE_URL;
      process.env.SESSION_SECRET = "test-secret";
      process.env.GOOGLE_CLIENT_ID = "test-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";

      const { validateEnv } = await import("../config/index.js");

      expect(() => validateEnv()).toThrow("Missing environment variables: DATABASE_URL");
    });

    it("should throw error when SESSION_SECRET is missing", async () => {
      process.env.DATABASE_URL = "postgresql://test";
      delete process.env.SESSION_SECRET;
      process.env.GOOGLE_CLIENT_ID = "test-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";

      const { validateEnv } = await import("../config/index.js");

      expect(() => validateEnv()).toThrow("Missing environment variables: SESSION_SECRET");
    });

    it("should throw error when GOOGLE_CLIENT_ID is missing", async () => {
      process.env.DATABASE_URL = "postgresql://test";
      process.env.SESSION_SECRET = "test-secret";
      delete process.env.GOOGLE_CLIENT_ID;
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";

      const { validateEnv } = await import("../config/index.js");

      expect(() => validateEnv()).toThrow("Missing environment variables: GOOGLE_CLIENT_ID");
    });

    it("should throw error when GOOGLE_CLIENT_SECRET is missing", async () => {
      process.env.DATABASE_URL = "postgresql://test";
      process.env.SESSION_SECRET = "test-secret";
      process.env.GOOGLE_CLIENT_ID = "test-id";
      delete process.env.GOOGLE_CLIENT_SECRET;

      const { validateEnv } = await import("../config/index.js");

      expect(() => validateEnv()).toThrow("Missing environment variables: GOOGLE_CLIENT_SECRET");
    });

    it("should throw error when multiple required vars are missing", async () => {
      delete process.env.DATABASE_URL;
      delete process.env.SESSION_SECRET;
      process.env.GOOGLE_CLIENT_ID = "test-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";

      const { validateEnv } = await import("../config/index.js");

      expect(() => validateEnv()).toThrow(
        "Missing environment variables: DATABASE_URL, SESSION_SECRET"
      );
    });

    it("should not throw when all required vars are present", async () => {
      process.env.DATABASE_URL = "postgresql://test";
      process.env.SESSION_SECRET = "test-secret";
      process.env.GOOGLE_CLIENT_ID = "test-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";

      const { validateEnv } = await import("../config/index.js");

      expect(() => validateEnv()).not.toThrow();
    });
  });

  describe("config values", () => {
    beforeEach(() => {
      process.env.DATABASE_URL = "postgresql://test";
      process.env.SESSION_SECRET = "test-secret";
      process.env.GOOGLE_CLIENT_ID = "test-client-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
    });

    it("should use default values for optional env vars", async () => {
      delete process.env.NODE_ENV;
      delete process.env.PORT;
      delete process.env.APP_URL;

      const { config } = await import("../config/index.js");

      expect(config.nodeEnv).toBe("development");
      expect(config.port).toBe(8000);
      expect(config.appUrl).toBe("http://localhost:3000");
    });

    it("should use provided env var values", async () => {
      process.env.NODE_ENV = "production";
      process.env.PORT = "9000";
      process.env.APP_URL = "https://example.com";
      process.env.GOOGLE_CALLBACK_URL = "https://example.com/callback";

      const { config } = await import("../config/index.js");

      expect(config.nodeEnv).toBe("production");
      expect(config.port).toBe(9000);
      expect(config.appUrl).toBe("https://example.com");
      expect(config.google.callbackUrl).toBe("https://example.com/callback");
    });

    it("should set isProduction correctly based on NODE_ENV", async () => {
      process.env.NODE_ENV = "production";

      const { config } = await import("../config/index.js");

      expect(config.isProduction).toBe(true);
    });

    it("should set isProduction to false in development", async () => {
      process.env.NODE_ENV = "development";

      const { config } = await import("../config/index.js");

      expect(config.isProduction).toBe(false);
    });
  });

  describe("COOKIE_MAX_AGE", () => {
    it("should be 7 days in seconds", async () => {
      process.env.DATABASE_URL = "postgresql://test";
      process.env.SESSION_SECRET = "test-secret";
      process.env.GOOGLE_CLIENT_ID = "test-id";
      process.env.GOOGLE_CLIENT_SECRET = "test-secret";

      const { COOKIE_MAX_AGE } = await import("../config/index.js");

      expect(COOKIE_MAX_AGE).toBe(7 * 24 * 60 * 60);
      expect(COOKIE_MAX_AGE).toBe(604800);
    });
  });
});
