import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

// Valid env values satisfying @t3-oss/env-core schema constraints:
//   SESSION_SECRET requires min(32) chars
//   GOOGLE_CALLBACK_URL is required (not optional)
const VALID_ENV = {
  DATABASE_URL: "postgresql://localhost:5432/testdb",
  SESSION_SECRET: "a-sufficiently-long-secret-for-testing-32c",
  GOOGLE_CLIENT_ID: "test-client-id",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  GOOGLE_CALLBACK_URL: "http://localhost:8000/auth/google/callback",
};

describe("Config", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  // @t3-oss/env-core validates env vars eagerly inside createEnv() at module
  // load time, so the dynamic import itself rejects when a required var is
  // missing — validateEnv() is never reached in the error cases.
  describe("validateEnv", () => {
    it("should throw error when DATABASE_URL is missing", async () => {
      Object.assign(process.env, { ...VALID_ENV });
      delete process.env.DATABASE_URL;

      await expect(import("../config/index.js")).rejects.toThrow("Invalid environment variables");
    });

    it("should throw error when SESSION_SECRET is missing", async () => {
      Object.assign(process.env, { ...VALID_ENV });
      delete process.env.SESSION_SECRET;

      await expect(import("../config/index.js")).rejects.toThrow("Invalid environment variables");
    });

    it("should throw error when GOOGLE_CLIENT_ID is missing", async () => {
      Object.assign(process.env, { ...VALID_ENV });
      delete process.env.GOOGLE_CLIENT_ID;

      await expect(import("../config/index.js")).rejects.toThrow("Invalid environment variables");
    });

    it("should throw error when GOOGLE_CLIENT_SECRET is missing", async () => {
      Object.assign(process.env, { ...VALID_ENV });
      delete process.env.GOOGLE_CLIENT_SECRET;

      await expect(import("../config/index.js")).rejects.toThrow("Invalid environment variables");
    });

    it("should throw error when multiple required vars are missing", async () => {
      Object.assign(process.env, { ...VALID_ENV });
      delete process.env.DATABASE_URL;
      delete process.env.SESSION_SECRET;

      await expect(import("../config/index.js")).rejects.toThrow("Invalid environment variables");
    });

    it("should not throw when all required vars are present", async () => {
      Object.assign(process.env, { ...VALID_ENV });

      await expect(import("../config/index.js")).resolves.toBeDefined();
    });
  });

  describe("config values", () => {
    beforeEach(() => {
      Object.assign(process.env, { ...VALID_ENV });
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
      Object.assign(process.env, { ...VALID_ENV });

      const { COOKIE_MAX_AGE } = await import("../config/index.js");

      expect(COOKIE_MAX_AGE).toBe(7 * 24 * 60 * 60);
      expect(COOKIE_MAX_AGE).toBe(604800);
    });
  });
});
