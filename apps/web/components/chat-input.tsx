"use client";

import { useEffect, useState } from "react";

import Image from "next/image";

import { FileIcon, Mic } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import {
  ChatInput,
  ChatInputEditor,
  ChatInputGroupAddon,
  ChatInputMention,
  ChatInputMentionButton,
  ChatInputSubmitButton,
  createMentionConfig,
  useChatInput,
} from "@workspace/ui/components/chat-input";
import { Toggle } from "@workspace/ui/components/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { highlightCode } from "@workspace/ui/lib/highlight-code";

type MemberItem = {
  id: string;
  name: string;
  image?: string;
  type: string;
};

type FileItem = {
  id: string;
  name: string;
};

const members: MemberItem[] = [
  { id: "1", name: "Alice", image: "/avatar-1.png", type: "agent" },
  { id: "2", name: "Bob", type: "user" },
  { id: "3", name: "Charlie", image: "/avatar-2.png", type: "bot" },
  { id: "4", name: "Dave", type: "user" },
];

const files: FileItem[] = [
  { id: "f1", name: "report.pdf" },
  { id: "f2", name: "image.png" },
  { id: "f3", name: "notes.txt" },
];

// Reusable icon component pointing to the public/integrations SVGs
function IntegrationIcon({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-md bg-white p-0.5 opacity-90 shadow-sm transition-opacity hover:opacity-100">
      <Image src={src} alt={alt} width={16} height={16} className="object-contain" />
    </div>
  );
}

export function ChatInputWithMentions({
  onSubmit,
  placeholder = "",
}: {
  onSubmit?: (value: string) => void;
  placeholder?: string;
}) {
  const [highlightedOutput, setHighlightedOutput] = useState<string>("");
  const [isAutoMode, setIsAutoMode] = useState(false);

  const { value, onChange, parsed, handleSubmit, mentionConfigs } = useChatInput({
    mentions: {
      member: createMentionConfig<MemberItem>({
        type: "member",
        trigger: "@",
        items: members,
      }),
      file: createMentionConfig<FileItem>({
        type: "file",
        trigger: "/",
        items: files,
      }),
    },
    onSubmit: (parsedValue) => {
      if (onSubmit) {
        onSubmit(parsedValue.content);
      }
    },
  });

  const hasText = parsed.content.trim().length > 0;

  useEffect(() => {
    highlightCode(JSON.stringify(parsed, null, 2), "json").then(setHighlightedOutput);
  }, [parsed]);

  return (
    <div className="w-full pb-8">
      <div className="relative w-full rounded-[24px] bg-gradient-to-b from-white/20 to-transparent p-[1px] shadow-[0_0_15px_rgba(255,255,255,0.05)]">
        <style>{`
          .tiptap p.is-editor-empty:first-child::before,
          .tiptap p.is-empty:first-child::before {
            color: #555555 !important;
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }
        `}</style>
        <ChatInput
          onSubmit={handleSubmit}
          value={value}
          onChange={onChange}
          className="flex flex-col overflow-hidden rounded-[23px] border-0 !bg-[#070707] shadow-2xl ring-1 ring-transparent transition-all duration-300 focus-within:ring-white/5">
          <ChatInputMention
            type={mentionConfigs.member.type}
            trigger={mentionConfigs.member.trigger}
            items={mentionConfigs.member.items}>
            {(item) => (
              <>
                <Avatar className="h-5 w-5">
                  <AvatarImage src={item.image ?? "/placeholder.jpg"} alt={item.name} />
                  <AvatarFallback>{item.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="max-w-[100px] truncate text-xs font-medium" title={item.name}>
                  {item.name}
                </span>
                <Badge variant="outline" className="ml-auto h-5 px-1 text-xs">
                  {item.type}
                </Badge>
              </>
            )}
          </ChatInputMention>
          <ChatInputMention
            type={mentionConfigs.file.type}
            trigger={mentionConfigs.file.trigger}
            items={mentionConfigs.file.items}>
            {(item) => (
              <>
                <FileIcon className="text-muted-foreground h-3 w-3" />
                <span className="max-w-[150px] truncate text-xs font-medium" title={item.name}>
                  {item.name}
                </span>
              </>
            )}
          </ChatInputMention>

          {/* Top: Text input */}
          <ChatInputEditor
            placeholder="Type and press enter to start chatting..."
            className="min-h-[32px] border-none bg-transparent px-5 pt-4 pb-1 font-sans text-[15px] tracking-tight text-[#c8ccd8] placeholder:text-[#555555] focus-visible:ring-0"
          />

          {/* Bottom: Actions bar */}
          <ChatInputGroupAddon align="block-end" className="flex w-full flex-col">
            <div className="flex w-full items-center justify-between px-4 pt-1 pb-3">
              <div className="flex items-center gap-2">
                <ChatInputMentionButton
                  variant="ghost"
                  className="h-8 w-8 rounded-full p-0 text-white hover:bg-white/10 hover:text-white [&>svg]:h-[26px] [&>svg]:w-[26px] [&>svg]:stroke-[2.5]"
                />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Toggle
                      variant="outline"
                      size="sm"
                      pressed={isAutoMode}
                      onPressedChange={setIsAutoMode}
                      className="bubble h-8 cursor-pointer gap-2 rounded-xl border border-white/[0.08] px-3.5 text-[#9a9a9a] select-none hover:text-[#c0c0c0] data-[state=on]:text-[#c0bcc8]"
                      style={{
                        background: isAutoMode
                          ? "linear-gradient(to bottom, #2d2440, #1e1b30)"
                          : "#141414",
                        boxShadow: isAutoMode
                          ? "0px 4px 0px 0px #151220, 0px 0px 6px rgba(55, 45, 80, 0.25)"
                          : "0px 0px 0px 0px #0a0a0a",
                        transform: isAutoMode ? "translateY(0px)" : "translateY(3px)",
                        transition: "all 0.2s ease",
                        borderColor: isAutoMode
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(255,255,255,0.08)",
                      }}>
                      <span className="text-[13px] font-medium">Auto</span>
                      <div
                        className={`bubble flex h-[16px] w-[16px] items-center justify-center rounded-full transition-all duration-200 ${
                          isAutoMode
                            ? "bg-white/20 text-white/90"
                            : "border border-[#3a3a3a] bg-[#2a2a2a]"
                        }`}>
                        {isAutoMode && (
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 16 16"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M3.5 8.5L6.5 11.5L12.5 4.5"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </div>
                    </Toggle>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Auto Approve Actions</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1 h-8 w-8 rounded-full text-[#999999] hover:bg-white/10 hover:text-white">
                  <Mic className="h-5 w-5 stroke-[2.5]" />
                </Button>
                <ChatInputSubmitButton
                  className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full drop-shadow-sm transition-all [&>svg]:h-[24px] [&>svg]:w-[24px] [&>svg]:stroke-[3] ${hasText ? "bg-gradient-to-b from-white to-[#c0c0c8] text-black shadow hover:brightness-110" : "border border-[#404040] bg-gradient-to-b from-[#6a6a6a] to-[#454545] text-[#16161a] hover:brightness-110"}`}
                />
              </div>
            </div>
          </ChatInputGroupAddon>
        </ChatInput>
      </div>
    </div>
  );
}
