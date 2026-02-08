"use client";

import { useState } from "react";
import {
  MessagesSquare,
  MoreHorizontal,
  Trash2,
  Edit,
  Share,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@workspace/ui/components/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { useTRPC } from "@workspace/trpc/client/react";

interface Chat {
  id: string;
  title: string;
  url: string;
}

export function NavChats({ chats }: { chats: Chat[] }) {
  const { isMobile } = useSidebar();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [renameDialog, setRenameDialog] = useState<{
    open: boolean;
    chatId: string;
    currentTitle: string;
  }>({ open: false, chatId: "", currentTitle: "" });
  const [newTitle, setNewTitle] = useState("");

  const deleteMutation = useMutation(
    trpc.conversation.delete.mutationOptions({
      onSuccess: (_, chatId) => {
        queryClient.invalidateQueries({
          queryKey: trpc.conversation.list.queryKey(),
        });
        // If we're on the deleted chat's page, redirect to /chat
        if (window.location.pathname === `/chat/${chatId}`) {
          router.push("/chat");
        }
      },
    })
  );

  const renameMutation = useMutation(
    trpc.conversation.updateTitle.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.conversation.list.queryKey(),
        });
        setRenameDialog({ open: false, chatId: "", currentTitle: "" });
        setNewTitle("");
      },
    })
  );

  const handleRename = (chat: Chat) => {
    setRenameDialog({ open: true, chatId: chat.id, currentTitle: chat.title });
    setNewTitle(chat.title);
  };

  const handleDelete = (chatId: string) => {
    if (confirm("Are you sure you want to delete this conversation?")) {
      deleteMutation.mutate({ id: chatId });
    }
  };

  const handleRenameSubmit = () => {
    if (newTitle.trim()) {
      renameMutation.mutate({ id: renameDialog.chatId, title: newTitle });
    }
  };

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel>Chats</SidebarGroupLabel>
        <SidebarMenu>
          {chats.map((chat) => (
            <SidebarMenuItem key={chat.id}>
              <SidebarMenuButton asChild>
                <a href={chat.url}>
                  <MessagesSquare className="h-4 w-4" />
                  <span className="truncate">{chat.title}</span>
                </a>
              </SidebarMenuButton>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction showOnHover>
                    <MoreHorizontal />
                    <span className="sr-only">More</span>
                  </SidebarMenuAction>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-48 rounded-lg"
                  side={isMobile ? "bottom" : "right"}
                  align={isMobile ? "end" : "start"}
                >
                  <DropdownMenuItem onClick={() => handleRename(chat)}>
                    <Edit className="text-muted-foreground" />
                    <span>Rename</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled>
                    <Share className="text-muted-foreground" />
                    <span>Share</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => handleDelete(chat.id)}
                  >
                    <Trash2 className="text-destructive" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>

      <Dialog open={renameDialog.open} onOpenChange={(open) => setRenameDialog({ ...renameDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
            <DialogDescription>
              Enter a new title for this conversation.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Conversation title"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleRenameSubmit();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialog({ open: false, chatId: "", currentTitle: "" })}
            >
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} disabled={renameMutation.isPending}>
              {renameMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
