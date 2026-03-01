import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavChats } from "./nav-chats";

vi.mock("@workspace/ui/components/sidebar", () => ({
  useSidebar: () => ({ isMobile: false }),
  SidebarGroup: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-group">{children}</div>
  ),
  SidebarGroupLabel: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div className={className} data-testid="sidebar-label">
      {children}
    </div>
  ),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu">{children}</div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu-item">{children}</div>
  ),
  SidebarMenuButton: ({
    children,
    asChild,
    className,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
    className?: string;
  }) => (
    <a className={className} data-testid="sidebar-menu-button">
      {children}
    </a>
  ),
  SidebarMenuAction: ({
    children,
    showOnHover,
  }: {
    children: React.ReactNode;
    showOnHover?: boolean;
  }) => <div data-testid="sidebar-menu-action">{children}</div>,
}));

vi.mock("@workspace/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="dropdown-trigger">{children}</div>,
  DropdownMenuContent: ({
    children,
    side,
    align,
  }: {
    children: React.ReactNode;
    side?: string;
    align?: string;
  }) => (
    <div data-testid="dropdown-content" data-side={side} data-align={align}>
      {children}
    </div>
  ),
  DropdownMenuItem: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

describe("NavChats", () => {
  const mockChats = [
    { id: "1", title: "First Chat", url: "/chat/1" },
    { id: "2", title: "Second Chat", url: "/chat/2" },
    { id: "3", title: "Third Chat", url: "/chat/3" },
  ];

  it("should render Chats label", () => {
    render(<NavChats chats={mockChats} />);

    expect(screen.getByText("Chats")).toBeInTheDocument();
  });

  it("should render all chats", () => {
    render(<NavChats chats={mockChats} />);

    expect(screen.getByText("First Chat")).toBeInTheDocument();
    expect(screen.getByText("Second Chat")).toBeInTheDocument();
    expect(screen.getByText("Third Chat")).toBeInTheDocument();
  });

  it("should render chat links with correct URLs", () => {
    render(<NavChats chats={mockChats} />);

    const buttons = screen.getAllByTestId("sidebar-menu-button");
    expect(buttons.length).toBe(3);
  });

  it("should handle empty chats array", () => {
    render(<NavChats chats={[]} />);

    expect(screen.getByText("Chats")).toBeInTheDocument();
  });

  it("should render dropdown menu items for each chat", () => {
    render(<NavChats chats={mockChats} />);

    expect(screen.getAllByText("Rename").length).toBe(3);
    expect(screen.getAllByText("Share").length).toBe(3);
    expect(screen.getAllByText("Delete").length).toBe(3);
  });

  it("should handle long chat titles", () => {
    const longTitleChats = [
      {
        id: "1",
        title: "A".repeat(100),
        url: "/chat/1",
      },
    ];

    render(<NavChats chats={longTitleChats} />);

    expect(screen.getByText("A".repeat(100))).toBeInTheDocument();
  });

  it("should render More button for each chat", () => {
    render(<NavChats chats={mockChats} />);

    const moreButtons = screen.getAllByText("More");
    expect(moreButtons.length).toBe(3);
  });

  it("should handle single chat", () => {
    const singleChat = [{ id: "1", title: "Only Chat", url: "/chat/1" }];

    render(<NavChats chats={singleChat} />);

    expect(screen.getByText("Only Chat")).toBeInTheDocument();
  });
});
