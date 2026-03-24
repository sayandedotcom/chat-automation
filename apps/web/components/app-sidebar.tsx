"use client";

import * as React from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { BookOpen, Link as LinkIcon, MessageCircle, PanelLeftIcon, Settings } from "lucide-react";

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
import { cn } from "@workspace/ui/lib/utils";

import { useIsMobile } from "@/hooks/use-mobile";

// Navigation items for the top section
const navItems = [
  {
    title: "New Chat",
    url: "/chat",
    icon: MessageCircle,
  },
  {
    title: "Sample Prompts",
    url: "/sample-prompts",
    icon: BookOpen,
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
    <Sidebar collapsible="icon" className="border-r-0 !bg-[#000000]" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2 pt-2 pb-4">
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden hover:border-0 hover:bg-[#000000]"
                asChild>
                <Link href="/chat">
                  <Image src="/logo.png" alt="Logo" width={32} height={32} className="rounded-lg" />
                </Link>
              </SidebarMenuButton>
              <SidebarTrigger className="group/trigger ml-auto cursor-pointer group-data-[collapsible=icon]:mx-auto">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  width={28}
                  height={28}
                  className="hidden rounded-lg object-contain group-hover/trigger:!hidden group-data-[collapsible=icon]:block"
                />
                <PanelLeftIcon className="block !size-5 group-hover/trigger:!block group-data-[collapsible=icon]:hidden" />
              </SidebarTrigger>
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
                    (pathname === item.url || pathname.startsWith(`${item.url}/`)) &&
                      "bg-[#1A1A1A] text-white ring-1 ring-white/10"
                  )}>
                  <Link href={item.url}>
                    <item.icon />
                    <span className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
                      {item.title}
                    </span>
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
                (pathname === "/settings" || pathname.startsWith("/settings/")) &&
                  "bg-[#1A1A1A] text-white ring-1 ring-white/10"
              )}>
              <Link href="/settings">
                <Settings />
                <span className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-transparent">
                  Settings
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
