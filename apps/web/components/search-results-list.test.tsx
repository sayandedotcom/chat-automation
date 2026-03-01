import { describe, it, expect } from "vitest";
import { parseSearchResults } from "./search-results-list";

describe("search-results-list", () => {
  describe("parseSearchResults", () => {
    describe("markdown links", () => {
      it("should parse a single markdown link", () => {
        const text = "[Google](https://google.com)";
        const results = parseSearchResults(text);

        expect(results).toHaveLength(1);
        expect(results[0]!.title).toBe("Google");
        expect(results[0]!.url).toBe("https://google.com");
        expect(results[0]!.domain).toBe("google.com");
      });

      it("should parse multiple markdown links", () => {
        const text = `
          [Google](https://google.com)
          [GitHub](https://github.com)
          [Stack Overflow](https://stackoverflow.com)
        `;
        const results = parseSearchResults(text);

        expect(results).toHaveLength(3);
        expect(results.map((r) => r.title)).toEqual(["Google", "GitHub", "Stack Overflow"]);
      });

      it("should handle www prefix in markdown links", () => {
        const text = "[Example](https://www.example.com)";
        const results = parseSearchResults(text);

        expect(results[0]!.domain).toBe("example.com");
      });

      it("should generate favicon URL", () => {
        const text = "[Google](https://google.com)";
        const results = parseSearchResults(text);

        expect(results[0]!.favicon).toBe(
          "https://www.google.com/s2/favicons?domain=google.com&sz=32"
        );
      });
    });

    describe("plain URLs", () => {
      it("should parse a plain URL", () => {
        const text = "Check out https://example.com for more info";
        const results = parseSearchResults(text);

        expect(results).toHaveLength(1);
        expect(results[0]!.url).toBe("https://example.com");
        expect(results[0]!.domain).toBe("example.com");
      });

      it("should extract title from bold text before URL", () => {
        const text = "**Example Site:** https://example.com";
        const results = parseSearchResults(text);

        expect(results[0]!.title).toBe("Example Site");
      });

      it("should extract title from text before URL", () => {
        const text = "- Google Search: https://google.com";
        const results = parseSearchResults(text);

        expect(results[0]!.title).toContain("Google");
      });

      it("should use domain as title when no context available", () => {
        const text = "https://example.com";
        const results = parseSearchResults(text);

        expect(results[0]!.title).toBe("example.com");
      });
    });

    describe("deduplication", () => {
      it("should deduplicate by domain", () => {
        const text = `
          [Google](https://google.com)
          [Google 2](https://google.com/search)
          [Google 3](https://google.com/maps)
        `;
        const results = parseSearchResults(text);

        expect(results).toHaveLength(1);
      });

      it("should keep first occurrence when duplicates exist", () => {
        const text = `
          [First](https://example.com/page1)
          [Second](https://example.com/page2)
        `;
        const results = parseSearchResults(text);

        expect(results).toHaveLength(1);
        expect(results[0]!.title).toBe("First");
      });
    });

    describe("edge cases", () => {
      it("should return empty array for empty string", () => {
        const results = parseSearchResults("");
        expect(results).toHaveLength(0);
      });

      it("should return empty array for text without URLs", () => {
        const results = parseSearchResults("Hello world, no URLs here!");
        expect(results).toHaveLength(0);
      });

      it("should handle invalid URLs gracefully", () => {
        const text = "Check out https://[invalid-url] for more info";
        const results = parseSearchResults(text);

        expect(results).toHaveLength(0);
      });

      it("should handle URLs with paths", () => {
        const text = "https://example.com/path/to/page?query=value";
        const results = parseSearchResults(text);

        expect(results).toHaveLength(1);
        expect(results[0]!.url).toBe("https://example.com/path/to/page?query=value");
        expect(results[0]!.domain).toBe("example.com");
      });

      it("should handle URLs with ports", () => {
        const text = "https://localhost:3000";
        const results = parseSearchResults(text);

        expect(results).toHaveLength(1);
        expect(results[0]!.domain).toBe("localhost");
      });

      it("should prefer markdown links over plain URLs", () => {
        const text = `
          [GitHub](https://github.com)
          Check https://github.com/features
        `;
        const results = parseSearchResults(text);

        expect(results).toHaveLength(1);
        expect(results[0]!.title).toBe("GitHub");
      });
    });

    describe("complex scenarios", () => {
      it("should parse search results with mixed formats", () => {
        const text = `
          ## Search Results
          
          1. **Wikipedia:** The free encyclopedia (https://wikipedia.org)
          2. [MDN Web Docs](https://developer.mozilla.org)
          3. https://stackoverflow.com
        `;
        const results = parseSearchResults(text);

        expect(results.length).toBeGreaterThan(0);
      });

      it("should handle markdown links with special characters in title", () => {
        const text = "[C++ Reference (cppreference.com)](https://cppreference.com)";
        const results = parseSearchResults(text);

        expect(results[0]!.title).toBe("C++ Reference (cppreference.com)");
      });

      it("should handle multiple URLs on same line", () => {
        const text = "Visit https://google.com/search or https://github.com/repo for more info";
        const results = parseSearchResults(text);

        expect(results.length).toBeGreaterThanOrEqual(1);
      });
    });
  });
});
