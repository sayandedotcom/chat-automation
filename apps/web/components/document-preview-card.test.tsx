import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentPreviewCard } from "./document-preview-card";

describe("DocumentPreviewCard", () => {
  const defaultProps = {
    title: "Test Document",
    content: "# Hello World\n\nThis is test content.",
  };

  it("should render with title and content", () => {
    render(<DocumentPreviewCard {...defaultProps} />);

    expect(screen.getByText("Test Document")).toBeInTheDocument();
    expect(screen.getByText("Create Document")).toBeInTheDocument();
  });

  it("should render content as markdown", () => {
    render(<DocumentPreviewCard {...defaultProps} />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Test Document");
  });

  it("should show permissions button", () => {
    render(<DocumentPreviewCard {...defaultProps} />);

    expect(screen.getByText("Permissions")).toBeInTheDocument();
  });

  it("should toggle collapse when permissions button clicked", () => {
    render(<DocumentPreviewCard {...defaultProps} />);

    const permissionsBtn = screen.getByText("Permissions");

    expect(screen.getByText("Hello World")).toBeInTheDocument();

    fireEvent.click(permissionsBtn);

    expect(screen.queryByText("Hello World")).not.toBeInTheDocument();

    fireEvent.click(permissionsBtn);

    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("should call onApprove when Create button clicked", () => {
    const onApprove = vi.fn();
    render(<DocumentPreviewCard {...defaultProps} onApprove={onApprove} />);

    const createBtn = screen.getByText("Create");
    fireEvent.click(createBtn);

    expect(onApprove).toHaveBeenCalled();
  });

  it("should call onCancel when Cancel button clicked", () => {
    const onCancel = vi.fn();
    render(<DocumentPreviewCard {...defaultProps} onCancel={onCancel} />);

    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalled();
  });

  it("should show loading state", () => {
    render(<DocumentPreviewCard {...defaultProps} isLoading={true} />);

    expect(screen.getByText("Creating...")).toBeInTheDocument();
  });

  it("should disable buttons when loading", () => {
    const onApprove = vi.fn();
    const onCancel = vi.fn();
    render(
      <DocumentPreviewCard
        {...defaultProps}
        isLoading={true}
        onApprove={onApprove}
        onCancel={onCancel}
      />
    );

    const createBtn = screen.getByText("Creating...");
    const cancelBtn = screen.getByText("Cancel");

    expect(createBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });

  it("should render custom icon", () => {
    const customIcon = <span data-testid="custom-icon">ICON</span>;
    render(<DocumentPreviewCard {...defaultProps} icon={customIcon} />);

    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <DocumentPreviewCard {...defaultProps} className="custom-class" />
    );

    expect(container.firstChild).toHaveClass("custom-class");
  });

  it("should show keyboard shortcut hint on Create button", () => {
    render(<DocumentPreviewCard {...defaultProps} />);

    expect(screen.getByText("⌘")).toBeInTheDocument();
    expect(screen.getByText("↵")).toBeInTheDocument();
  });

  it("should render reset button", () => {
    render(<DocumentPreviewCard {...defaultProps} />);

    const resetBtn = screen.getByRole("button", { name: "" });
    expect(resetBtn).toBeInTheDocument();
  });

  it("should handle empty content", () => {
    render(<DocumentPreviewCard title="Empty" content="" />);

    expect(screen.getByText("Empty")).toBeInTheDocument();
  });

  it("should handle long content", () => {
    const longContent = "A".repeat(1000);
    render(<DocumentPreviewCard title="Long" content={longContent} />);

    expect(screen.getByText("Long")).toBeInTheDocument();
  });
});
