"use client";

import * as React from "react";
import {
  Bot,
  GitBranch,
  MessageSquarePlus,
  MessagesSquare,
  Puzzle,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
} from "lucide-react";

import { NavChats } from "@/components/nav-chats";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@workspace/ui/components/sidebar";

// Navigation items for the top section
const navItems = [
  {
    title: "New Chat",
    url: "/chat",
    icon: MessageSquarePlus,
  },
  {
    title: "Search",
    url: "/search",
    icon: Search,
    shortcut: "⌘ K",
  },
  {
    title: "Integrations",
    url: "/integrations",
    icon: Puzzle,
  },
  {
    title: "Workflows",
    url: "/workflows",
    icon: GitBranch,
  },
  {
    title: "Skills",
    url: "/skills",
    icon: Bot,
  },
  {
    title: "Marketplace",
    url: "/marketplace",
    icon: ShoppingBag,
  },
];

// Sample chat history
const chats = [
  {
    id: "1",
    title: "Onboarding Sayan",
    url: "/chat/1",
  },
  {
    id: "2",
    title: "New Chat",
    url: "/chat/2",
  },
];

const user = {
  name: "shadcn",
  email: "m@example.com",
  avatar: "/avatars/shadcn.jpg",
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              asChild
            >
              <a href="/chat">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                  <Sparkles className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Chat AI</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Assistant
                  </span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title}>
                  <a href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                    {item.shortcut && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {item.shortcut}
                      </span>
                    )}
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Chats Section */}
        <NavChats chats={chats} />
      </SidebarContent>

      <SidebarFooter>
        {/* Settings */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Settings">
              <a href="/settings">
                <Settings />
                <span>Settings</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
