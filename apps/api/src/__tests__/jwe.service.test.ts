import { describe, expect, it, vi } from "vitest";

import {
  createSessionToken,
  decryptSessionToken,
  generateSessionId,
} from "../services/jwe.service.js";

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
    notion: {
      clientId: undefined,
      clientSecret: undefined,
      redirectUri: undefined,
    },
    validate: vi.fn(),
  },
  COOKIE_MAX_AGE: 604800,
}));

describe("JWE Service", () => {
  const mockPayload = {
    userId: "user-123",
    email: "test@example.com",
    name: "Test User",
    image: "https://example.com/avatar.png",
    sessionId: "session-456",
  };

  describe("generateSessionId", () => {
    it("should generate a valid UUID v4", () => {
      const sessionId = generateSessionId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(sessionId).toMatch(uuidRegex);
    });

    it("should generate unique session IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("createSessionToken", () => {
    it("should create a valid JWE token", async () => {
      const token = await createSessionToken(mockPayload);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(5);
    });

    it("should create different tokens for different payloads", async () => {
      const token1 = await createSessionToken(mockPayload);
      const token2 = await createSessionToken({
        ...mockPayload,
        userId: "user-789",
      });
      expect(token1).not.toBe(token2);
    });

    it("should create different tokens for same payload at different times", async () => {
      const token1 = await createSessionToken(mockPayload);
      await new Promise((r) => setTimeout(r, 100));
      const token2 = await createSessionToken(mockPayload);
      expect(token1).not.toBe(token2);
    });
  });

  describe("decryptSessionToken", () => {
    it("should decrypt a valid token and return the payload", async () => {
      const token = await createSessionToken(mockPayload);
      const decrypted = await decryptSessionToken(token);

      expect(decrypted).not.toBeNull();
      expect(decrypted!.userId).toBe(mockPayload.userId);
      expect(decrypted!.email).toBe(mockPayload.email);
      expect(decrypted!.name).toBe(mockPayload.name);
      expect(decrypted!.image).toBe(mockPayload.image);
      expect(decrypted!.sessionId).toBe(mockPayload.sessionId);
      expect(decrypted!.iat).toBeDefined();
      expect(decrypted!.exp).toBeDefined();
    });

    it("should return null for an invalid token", async () => {
      const result = await decryptSessionToken("invalid.token.here");
      expect(result).toBeNull();
    });

    it("should return null for a malformed token", async () => {
      const result = await decryptSessionToken("not-a-jwe-token");
      expect(result).toBeNull();
    });

    it("should return null for an empty string token", async () => {
      const result = await decryptSessionToken("");
      expect(result).toBeNull();
    });

    it("should handle null name and image in payload", async () => {
      const payloadWithNulls = {
        ...mockPayload,
        name: null,
        image: null,
      };
      const token = await createSessionToken(payloadWithNulls);
      const decrypted = await decryptSessionToken(token);

      expect(decrypted).not.toBeNull();
      expect(decrypted!.name).toBeNull();
      expect(decrypted!.image).toBeNull();
    });

    it("should set correct expiration time", async () => {
      const token = await createSessionToken(mockPayload);
      const decrypted = await decryptSessionToken(token);

      const expectedExp = Math.floor(Date.now() / 1000) + 604800;
      const tolerance = 2;

      expect(decrypted!.exp).toBeGreaterThanOrEqual(expectedExp - tolerance);
      expect(decrypted!.exp).toBeLessThanOrEqual(expectedExp + tolerance);
    });
  });

  describe("encrypt/decrypt roundtrip", () => {
    it("should preserve all payload data through encrypt/decrypt cycle", async () => {
      const payloads = [
        {
          userId: "user-1",
          email: "user1@example.com",
          name: "User One",
          image: "https://example.com/user1.png",
          sessionId: "session-1",
        },
        {
          userId: "user-2",
          email: "user2@example.com",
          name: null,
          image: null,
          sessionId: "session-2",
        },
        {
          userId: "user-3",
          email: "user3+test@example.org",
          name: "User Three with Special Chars!@#$%",
          image: "https://example.com/path/to/image.png?v=1&t=123",
          sessionId: "session-3",
        },
      ];

      for (const payload of payloads) {
        const token = await createSessionToken(payload);
        const decrypted = await decryptSessionToken(token);

        expect(decrypted).not.toBeNull();
        expect(decrypted!.userId).toBe(payload.userId);
        expect(decrypted!.email).toBe(payload.email);
        expect(decrypted!.name).toBe(payload.name);
        expect(decrypted!.image).toBe(payload.image);
        expect(decrypted!.sessionId).toBe(payload.sessionId);
      }
    });
  });
});
