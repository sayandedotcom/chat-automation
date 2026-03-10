import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NavUser } from "./nav-user";

vi.mock("@workspace/ui/components/sidebar", () => ({
  useSidebar: () => ({ isMobile: false }),
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu">{children}</div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SidebarMenuButton: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <button className={className} data-testid="menu-button">
      {children}
    </button>
  ),
}));

vi.mock("@workspace/ui/components/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div data-testid="trigger">{children}</div>,
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
  DropdownMenuGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <div onClick={onClick}>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("@workspace/ui/components/avatar", () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="avatar">{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("NavUser", () => {
  const mockUser = {
    name: "John Doe",
    email: "john@example.com",
    avatar: "https://example.com/avatar.jpg",
  };

  it("should render user name", () => {
    render(<NavUser user={mockUser} />);

    expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
  });

  it("should render user email", () => {
    render(<NavUser user={mockUser} />);

    expect(screen.getAllByText("john@example.com").length).toBeGreaterThan(0);
  });

  it("should render user avatar", () => {
    render(<NavUser user={mockUser} />);

    const avatars = screen.getAllByRole("img");
    expect(avatars.length).toBeGreaterThan(0);
    expect(avatars[0]).toHaveAttribute("src", "https://example.com/avatar.jpg");
  });

  it("should render avatar fallback", () => {
    render(<NavUser user={mockUser} />);

    expect(screen.getAllByText("CN").length).toBeGreaterThan(0);
  });

  it("should render menu items in dropdown", () => {
    render(<NavUser user={mockUser} />);

    expect(screen.getByText("Upgrade to Pro")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Billing")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Log out")).toBeInTheDocument();
  });

  it("should handle user with long name", () => {
    const longNameUser = {
      name: "A".repeat(100),
      email: "test@example.com",
      avatar: "",
    };

    render(<NavUser user={longNameUser} />);

    expect(screen.getAllByText("A".repeat(100)).length).toBeGreaterThan(0);
  });

  it("should handle user with long email", () => {
    const longEmailUser = {
      name: "Test",
      email: "a".repeat(50) + "@example.com",
      avatar: "",
    };

    render(<NavUser user={longEmailUser} />);

    expect(screen.getAllByText("a".repeat(50) + "@example.com").length).toBeGreaterThan(0);
  });

  it("should handle empty avatar", () => {
    const noAvatarUser = {
      name: "No Avatar",
      email: "noavatar@example.com",
      avatar: "",
    };

    render(<NavUser user={noAvatarUser} />);

    expect(screen.getAllByText("No Avatar").length).toBeGreaterThan(0);
  });
});
