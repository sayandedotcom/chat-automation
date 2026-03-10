import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "./markdown-renderer";

describe("MarkdownRenderer", () => {
  describe("basic rendering", () => {
    it("should render plain text", () => {
      render(<MarkdownRenderer content="Hello world" />);

      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("should render empty content", () => {
      const { container } = render(<MarkdownRenderer content="" />);

      expect(container.querySelector(".prose")).toBeInTheDocument();
    });
  });

  describe("headings", () => {
    it("should render h1 heading", () => {
      render(<MarkdownRenderer content="# Heading 1" />);

      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Heading 1");
    });

    it("should render h2 heading", () => {
      render(<MarkdownRenderer content="## Heading 2" />);

      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Heading 2");
    });

    it("should render h3 heading", () => {
      render(<MarkdownRenderer content="### Heading 3" />);

      expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Heading 3");
    });
  });

  describe("text formatting", () => {
    it("should render bold text", () => {
      render(<MarkdownRenderer content="This is **bold** text" />);

      const strong = screen.getByText("bold");
      expect(strong.tagName).toBe("STRONG");
    });

    it("should render italic text", () => {
      render(<MarkdownRenderer content="This is *italic* text" />);

      const em = screen.getByText("italic");
      expect(em.tagName).toBe("EM");
    });

    it("should render bold and italic text", () => {
      render(<MarkdownRenderer content="This is ***bold and italic*** text" />);

      expect(screen.getByText("bold and italic")).toBeInTheDocument();
    });
  });

  describe("links", () => {
    it("should render links", () => {
      render(<MarkdownRenderer content="[Google](https://google.com)" />);

      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "https://google.com");
      expect(link).toHaveTextContent("Google");
    });

    it("should render multiple links", () => {
      render(<MarkdownRenderer content="[Link 1](/path1) and [Link 2](/path2)" />);

      const links = screen.getAllByRole("link");
      expect(links).toHaveLength(2);
    });
  });

  describe("code blocks", () => {
    it("should render inline code", () => {
      render(<MarkdownRenderer content="Use `console.log` for debugging" />);

      const code = screen.getByText("console.log");
      expect(code.tagName).toBe("CODE");
    });

    it("should render code block with language", () => {
      const { container } = render(
        <MarkdownRenderer content={"```javascript\nconst x = 1;\n```"} />
      );

      expect(container.querySelector("pre")).toBeInTheDocument();
    });

    it("should render code block without language", () => {
      render(<MarkdownRenderer content={"```\nplain code\n```"} />);

      expect(screen.getByText(/plain code/)).toBeInTheDocument();
    });
  });

  describe("lists", () => {
    it("should render unordered list", () => {
      const { container } = render(<MarkdownRenderer content="- Item 1\n- Item 2\n- Item 3" />);

      expect(container.querySelector("ul")).toBeInTheDocument();
    });

    it("should render ordered list", () => {
      const { container } = render(<MarkdownRenderer content="1. First\n2. Second\n3. Third" />);

      expect(container.querySelector("ol")).toBeInTheDocument();
    });

    it("should render nested list", () => {
      const { container } = render(
        <MarkdownRenderer content="- Item 1\n  - Nested item\n- Item 2" />
      );

      expect(container.querySelector("ul")).toBeInTheDocument();
    });
  });

  describe("GFM features", () => {
    it("should render strikethrough", () => {
      render(<MarkdownRenderer content="This is ~~strikethrough~~ text" />);

      expect(screen.getByText("strikethrough")).toBeInTheDocument();
    });

    it("should render task list", () => {
      const { container } = render(<MarkdownRenderer content="- [x] Done\n- [ ] Not done" />);

      const checkboxes = container.querySelectorAll("input[type='checkbox']");
      expect(checkboxes.length).toBeGreaterThan(0);
    });

    it("should render table", () => {
      render(<MarkdownRenderer content={"| Name | Age |\n|------|-----|\n| John | 25  |"} />);

      expect(screen.getByRole("table")).toBeInTheDocument();
      expect(screen.getByText("John")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
    });
  });

  describe("blockquotes", () => {
    it("should render blockquote", () => {
      render(<MarkdownRenderer content="> This is a quote" />);

      const quote = screen.getByText("This is a quote");
      expect(quote.closest("blockquote")).toBeInTheDocument();
    });
  });

  describe("horizontal rules", () => {
    it("should render horizontal rule", () => {
      const { container } = render(<MarkdownRenderer content="---" />);

      expect(container.querySelector("hr")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should handle special characters", () => {
      render(<MarkdownRenderer content="Special: &lt; &gt; &amp; ' &quot;" />);

      expect(screen.getByText(/Special:/)).toBeInTheDocument();
    });

    it("should handle very long content", () => {
      const longContent = "A".repeat(10000);
      const { container } = render(<MarkdownRenderer content={longContent} />);

      expect(container.querySelector(".prose")).toBeInTheDocument();
    });

    it("should handle mixed markdown", () => {
      render(
        <MarkdownRenderer content={"# Title\n\n**Bold** and *italic*\n\n- List item\n\n> Quote"} />
      );

      expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
      expect(screen.getByText("Bold")).toBeInTheDocument();
      expect(screen.getByRole("listitem")).toBeInTheDocument();
    });
  });
});
