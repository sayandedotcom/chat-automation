"use client";

import { FileIcon, Mic } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import { Toggle } from "@workspace/ui/components/toggle";
import { highlightCode } from "@workspace/ui/lib/highlight-code";
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
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";

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
    <div className="w-[22px] h-[22px] rounded-md flex items-center justify-center bg-white shadow-sm overflow-hidden p-0.5 opacity-90 hover:opacity-100 transition-opacity">
      <Image
        src={src}
        alt={alt}
        width={16}
        height={16}
        className="object-contain"
      />
    </div>
  );
}

export function ChatInputWithMentions({
  onSubmit,
  placeholder = "e.g., Research the best auth services, create a Notion doc with findings...",
}: {
  onSubmit?: (value: string) => void;
  placeholder?: string;
}) {
  const [highlightedOutput, setHighlightedOutput] = useState<string>("");
  const [isAutoMode, setIsAutoMode] = useState(false);

  const { value, onChange, parsed, handleSubmit, mentionConfigs } =
    useChatInput({
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

  useEffect(() => {
    highlightCode(JSON.stringify(parsed, null, 2), "json").then(
      setHighlightedOutput,
    );
  }, [parsed]);

  return (
    <div className="w-full flex justify-center items-center pb-8">
      <div className="w-full max-w-2xl relative">
        <ChatInput
          onSubmit={handleSubmit}
          value={value}
          onChange={onChange}
          className="bg-[#121214] border border-[#222225] rounded-[24px] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ring-1 ring-white/5 focus-within:ring-white/10 focus-within:border-[#333336]"
        >
          <ChatInputMention
            type={mentionConfigs.member.type}
            trigger={mentionConfigs.member.trigger}
            items={mentionConfigs.member.items}
          >
            {(item) => (
              <>
                <Avatar className="h-5 w-5">
                  <AvatarImage
                    src={item.image ?? "/placeholder.jpg"}
                    alt={item.name}
                  />
                  <AvatarFallback>{item.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span
                  className="text-xs font-medium truncate max-w-[100px]"
                  title={item.name}
                >
                  {item.name}
                </span>
                <Badge variant="outline" className="ml-auto text-xs px-1 h-5">
                  {item.type}
                </Badge>
              </>
            )}
          </ChatInputMention>
          <ChatInputMention
            type={mentionConfigs.file.type}
            trigger={mentionConfigs.file.trigger}
            items={mentionConfigs.file.items}
          >
            {(item) => (
              <>
                <FileIcon className="h-3 w-3 text-muted-foreground" />
                <span
                  className="text-xs font-medium truncate max-w-[150px]"
                  title={item.name}
                >
                  {item.name}
                </span>
              </>
            )}
          </ChatInputMention>

          {/* Top: Text input */}
          <ChatInputEditor
            placeholder={placeholder}
            className="text-neutral-200 placeholder:text-[#6e6e77] min-h-[44px] text-[15px] pt-4 px-4 pb-2 bg-transparent border-none focus-visible:ring-0 font-sans tracking-tight"
          />

          {/* Bottom: Actions bar */}
          <ChatInputGroupAddon
            align="block-end"
            className="flex flex-col w-full"
          >
            <div className="flex items-center justify-between px-3 pb-3 pt-1 w-full">
              <div className="flex items-center gap-1.5">
                <ChatInputMentionButton
                  variant="ghost"
                  className="text-neutral-400 hover:text-neutral-200 hover:bg-white/5 rounded-full h-8 w-8 p-0"
                />

                <Toggle
                  variant="outline"
                  size="sm"
                  pressed={isAutoMode}
                  onPressedChange={setIsAutoMode}
                  className="h-7 px-3 gap-2 rounded-full border border-[#2a2a2e] bg-[#1a1a1e] text-[#a1a1aa] hover:text-white hover:bg-[#2a2a2e] data-[state=on]:bg-white/10 data-[state=on]:border-white/20 data-[state=on]:text-white transition-all shadow-sm"
                >
                  <span className="text-[13px] font-medium tracking-wide">
                    Auto
                  </span>
                  <div
                    className={`w-3 h-3 rounded-full flex items-center justify-center transition-all ${
                      isAutoMode
                        ? "bg-white/20 text-white"
                        : "bg-transparent border border-[#52525b]"
                    }`}
                  >
                    {isAutoMode && (
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M2.5 6.5L5 9L9.5 3.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                </Toggle>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-neutral-400 hover:text-white hover:bg-white/5 rounded-full h-8 w-8 ml-1"
                >
                  <Mic className="h-[18px] w-[18px]" />
                </Button>
                <ChatInputSubmitButton className="bg-[#2a2a2e] hover:bg-[#3a3a3e] text-[#a1a1aa] hover:text-white rounded-full h-8 w-8 transition-colors flex items-center justify-center shrink-0 [&>svg]:w-4 [&>svg]:h-4 [&>svg]:stroke-[2.5]" />
              </div>
            </div>

            {/* Competitor subtle row: Connect Your Tools */}
            <div className="flex items-center justify-start gap-4 border-t border-white/[0.04] px-4 py-3 bg-[#0e0e11]/50 rounded-b-[24px]">
              <span className="text-[11px] font-medium text-[#71717a] tracking-[0.03em]">
                Connect Your Tools
              </span>
              <div className="flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity cursor-pointer">
                <IntegrationIcon src="/integrations/gmail.svg" alt="Gmail" />
                <IntegrationIcon src="/integrations/notion.svg" alt="Notion" />
                <IntegrationIcon
                  src="/integrations/google_sheets.svg"
                  alt="Sheets"
                />
                <IntegrationIcon
                  src="/integrations/google_docs.svg"
                  alt="Docs"
                />
                <IntegrationIcon src="/integrations/drive.svg" alt="Drive" />
                <IntegrationIcon src="/integrations/slack.svg" alt="Slack" />
                <div className="w-[22px] h-[22px] rounded-md flex items-center justify-center bg-[#222] text-[#a1a1aa] border border-white/10 hover:bg-[#333] transition-colors">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14" />
                    <path d="M12 5v14" />
                  </svg>
                </div>
              </div>
            </div>
          </ChatInputGroupAddon>
        </ChatInput>
      </div>
    </div>
  );
}
