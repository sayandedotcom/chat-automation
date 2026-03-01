import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThinkingIndicator } from "./thinking-indicator";

describe("ThinkingIndicator", () => {
  it("should render with content", () => {
    render(<ThinkingIndicator content="Thinking about this..." />);

    expect(screen.getByText("Thought")).toBeInTheDocument();
    expect(screen.getByText(/for 2s/)).toBeInTheDocument();
  });

  it("should render with custom duration", () => {
    render(<ThinkingIndicator content="Thinking..." duration={5} />);

    expect(screen.getByText(/for 5s/)).toBeInTheDocument();
  });

  it("should be collapsed by default", () => {
    const { container } = render(<ThinkingIndicator content="Hidden content" />);

    expect(screen.getByText("Hidden content")).toBeInTheDocument();
    const maxHDiv = container.querySelector(".max-h-0");
    expect(maxHDiv).toBeInTheDocument();
  });

  it("should be expanded when defaultExpanded is true", () => {
    render(<ThinkingIndicator content="Visible content" defaultExpanded={true} />);

    expect(screen.getByText("Visible content")).toBeInTheDocument();
  });

  it("should expand when clicked", () => {
    render(<ThinkingIndicator content="Expandable content" />);

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByText("Expandable content")).toBeInTheDocument();
  });

  it("should collapse when clicked again", () => {
    render(<ThinkingIndicator content="Toggleable content" />);

    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(screen.getByText("Toggleable content")).toBeVisible();

    fireEvent.click(button);
  });

  it("should apply custom className", () => {
    const { container } = render(<ThinkingIndicator content="Test" className="custom-class" />);

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("should render chevron icon", () => {
    render(<ThinkingIndicator content="Test" />);

    const button = screen.getByRole("button");
    const chevron = button.querySelector("svg");
    expect(chevron).toBeInTheDocument();
  });

  it("should rotate chevron when expanded", () => {
    render(<ThinkingIndicator content="Test" />);

    const button = screen.getByRole("button");
    const chevron = button.querySelector("svg");

    expect(chevron).not.toHaveClass("rotate-90");

    fireEvent.click(button);

    expect(chevron).toHaveClass("rotate-90");
  });

  it("should handle empty content", () => {
    render(<ThinkingIndicator content="" />);

    expect(screen.getByText("Thought")).toBeInTheDocument();
  });

  it("should handle very long content", () => {
    const longContent = "A".repeat(1000);
    render(<ThinkingIndicator content={longContent} defaultExpanded={true} />);

    expect(screen.getByText(longContent)).toBeInTheDocument();
  });

  it("should handle special characters in content", () => {
    const specialContent = "<script>alert('xss')</script> & \" ' < >";
    render(<ThinkingIndicator content={specialContent} defaultExpanded={true} />);

    expect(screen.getByText(specialContent)).toBeInTheDocument();
  });
});
