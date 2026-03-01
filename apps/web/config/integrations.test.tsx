import { describe, it, expect } from "vitest";
import {
  integrations,
  oauthIntegrations,
  liveIntegrations,
  toolIconMap,
  toolNameMap,
} from "./integrations";

describe("integrations config", () => {
  describe("integrations array", () => {
    it("should have all required integrations", () => {
      const integrationIds = integrations.map((i) => i.id);
      expect(integrationIds).toContain("google-drive");
      expect(integrationIds).toContain("google-sheets");
      expect(integrationIds).toContain("google-slides");
      expect(integrationIds).toContain("google-docs");
      expect(integrationIds).toContain("google-calendar");
      expect(integrationIds).toContain("gmail");
      expect(integrationIds).toContain("slack");
      expect(integrationIds).toContain("github");
      expect(integrationIds).toContain("vercel");
      expect(integrationIds).toContain("notion");
      expect(integrationIds).toContain("linear");
      expect(integrationIds).toContain("supabase");
      expect(integrationIds).toContain("sentry");
      expect(integrationIds).toContain("web-search");
    });

    it("should have correct structure for each integration", () => {
      integrations.forEach((integration) => {
        expect(integration).toHaveProperty("id");
        expect(integration).toHaveProperty("name");
        expect(integration).toHaveProperty("description");
        expect(integration).toHaveProperty("icon");
        expect(integration).toHaveProperty("oauth");
        expect(integration).toHaveProperty("isLive");
        expect(typeof integration.id).toBe("string");
        expect(typeof integration.name).toBe("string");
        expect(typeof integration.description).toBe("string");
        expect(typeof integration.icon).toBe("string");
        expect(typeof integration.oauth).toBe("boolean");
        expect(typeof integration.isLive).toBe("boolean");
      });
    });

    it("should have unique ids", () => {
      const ids = integrations.map((i) => i.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("oauthIntegrations", () => {
    it("should only contain integrations with oauth=true", () => {
      oauthIntegrations.forEach((integration) => {
        expect(integration.oauth).toBe(true);
      });
    });

    it("should not contain web-search (no oauth)", () => {
      const hasWebSearch = oauthIntegrations.some((i) => i.id === "web-search");
      expect(hasWebSearch).toBe(false);
    });

    it("should be a subset of all integrations", () => {
      const allIds = new Set(integrations.map((i) => i.id));
      oauthIntegrations.forEach((integration) => {
        expect(allIds.has(integration.id)).toBe(true);
      });
    });
  });

  describe("liveIntegrations", () => {
    it("should only contain integrations with isLive=true", () => {
      liveIntegrations.forEach((integration) => {
        expect(integration.isLive).toBe(true);
      });
    });

    it("should contain expected live integrations", () => {
      const liveIds = liveIntegrations.map((i) => i.id);
      expect(liveIds).toContain("google-drive");
      expect(liveIds).toContain("google-sheets");
      expect(liveIds).toContain("google-docs");
      expect(liveIds).toContain("google-calendar");
      expect(liveIds).toContain("gmail");
      expect(liveIds).toContain("notion");
    });

    it("should not contain integrations that are not live", () => {
      const liveIds = liveIntegrations.map((i) => i.id);
      expect(liveIds).not.toContain("slack");
      expect(liveIds).not.toContain("github");
      expect(liveIds).not.toContain("vercel");
      expect(liveIds).not.toContain("linear");
      expect(liveIds).not.toContain("supabase");
      expect(liveIds).not.toContain("sentry");
      expect(liveIds).not.toContain("google-slides");
      expect(liveIds).not.toContain("web-search");
    });
  });

  describe("toolIconMap", () => {
    it("should have icon path for each integration", () => {
      integrations.forEach((integration) => {
        expect(toolIconMap[integration.id]).toBe(integration.icon);
      });
    });

    it("should have correct number of entries", () => {
      expect(Object.keys(toolIconMap).length).toBe(integrations.length);
    });

    it("should return string paths starting with /integrations/", () => {
      Object.values(toolIconMap).forEach((icon) => {
        expect(icon).toMatch(/^\/integrations\//);
      });
    });
  });

  describe("toolNameMap", () => {
    it("should have name for each integration", () => {
      integrations.forEach((integration) => {
        expect(toolNameMap[integration.id]).toBe(integration.name);
      });
    });

    it("should have correct number of entries", () => {
      expect(Object.keys(toolNameMap).length).toBe(integrations.length);
    });

    it("should return non-empty strings", () => {
      Object.values(toolNameMap).forEach((name) => {
        expect(typeof name).toBe("string");
        expect(name.length).toBeGreaterThan(0);
      });
    });
  });
});
