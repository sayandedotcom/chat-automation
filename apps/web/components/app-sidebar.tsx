"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  GitBranch,
  MessageCircle,
  Link as LinkIcon,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
  SquarePen,
  WandSparkles,
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
  SidebarTrigger,
} from "@workspace/ui/components/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePathname } from "next/navigation";
import { cn } from "@workspace/ui/lib/utils";

// Navigation items for the top section
const navItems = [
  {
    title: "New Chat",
    url: "/chat",
    icon: MessageCircle,
  },
  // {
  //   title: "Search",
  //   url: "/search",
  //   icon: Search,
  //   shortcut: "⌘ K",
  // },
  {
    title: "Integrations",
    url: "/integrations",
    icon: LinkIcon,
  },
  // {
  //   title: "Workflows",
  //   url: "/workflows",
  //   icon: GitBranch,
  // },
  // {
  //   title: "Skills",
  //   url: "/skills",
  //   icon: WandSparkles,
  // },
  // {
  //   title: "Marketplace",
  //   url: "/marketplace",
  //   icon: ShoppingBag,
  // },
];

// Sample chat history
const chats = [
  {
    id: "1",
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
  const isMobile = useIsMobile();
  const pathname = usePathname();
  
  return (
    <Sidebar collapsible="icon" className="!bg-[#000000] border-r-0" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2">
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden"
                asChild
              >
                <Link href="/chat">
                  <Image src="/logo.png" alt="Logo" width={32} height={32} className="rounded-lg" />
                </Link>
              </SidebarMenuButton>
              <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:ml-0 group-data-[collapsible=icon]:translate-x-0" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={pathname === item.url || pathname.startsWith(`${item.url}/`)}
                  className={cn(
                    "h-9 text-[15px] text-zinc-200 [&>svg]:size-[18px]",
                    (pathname === item.url || pathname.startsWith(`${item.url}/`)) && "bg-[#1A1A1A] ring-1 ring-white/10 text-white"
                  )}
                >
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        {/* <SidebarSeparator /> */}

        {/* Chats Section */}
        {/* <NavChats chats={chats} /> */}
      </SidebarContent>

      <SidebarFooter>
        {/* Settings */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Settings"
              isActive={pathname === "/settings" || pathname.startsWith("/settings/")}
              className={cn(
                "h-9 text-[15px] text-zinc-200 [&>svg]:size-[18px]",
                (pathname === "/settings" || pathname.startsWith("/settings/")) && "bg-[#1A1A1A] ring-1 ring-white/10 text-white"
              )}
            >
              <Link href="/settings">
                <Settings />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
