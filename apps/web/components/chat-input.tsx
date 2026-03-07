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
import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar";

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
      <div className="w-full relative rounded-[24px] p-[1px] bg-gradient-to-b from-white/20 to-transparent shadow-[0_0_15px_rgba(255,255,255,0.05)]">
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
          className="!bg-[#070707] border-0 rounded-[23px] shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ring-1 ring-transparent focus-within:ring-white/5"
        >
          <ChatInputMention
            type={mentionConfigs.member.type}
            trigger={mentionConfigs.member.trigger}
            items={mentionConfigs.member.items}
          >
            {(item) => (
              <>
                <Avatar className="h-5 w-5">
                  <AvatarImage src={item.image ?? "/placeholder.jpg"} alt={item.name} />
                  <AvatarFallback>{item.name[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-xs font-medium truncate max-w-[100px]" title={item.name}>
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
                <span className="text-xs font-medium truncate max-w-[150px]" title={item.name}>
                  {item.name}
                </span>
              </>
            )}
          </ChatInputMention>

          {/* Top: Text input */}
          <ChatInputEditor
            placeholder="Type and press enter to start chatting..."
            className="text-[#e5e5e5] placeholder:text-[#555555] min-h-[32px] text-[16px] pt-4 px-5 pb-1 bg-transparent border-none focus-visible:ring-0 font-sans tracking-tight"
          />

          {/* Bottom: Actions bar */}
          <ChatInputGroupAddon align="block-end" className="flex flex-col w-full">
            <div className="flex items-center justify-between px-4 pb-3 pt-1 w-full">
              <div className="flex items-center gap-2">
                <ChatInputMentionButton
                  variant="ghost"
                  className="text-[#999999] hover:text-white hover:bg-white/10 rounded-full h-8 w-8 p-0 [&>svg]:h-[26px] [&>svg]:w-[26px] [&>svg]:stroke-[2.5]"
                />

                <Toggle
                  variant="outline"
                  size="sm"
                  pressed={isAutoMode}
                  onPressedChange={setIsAutoMode}
                  className="h-8 px-3.5 gap-2 rounded-xl border border-white/[0.08] bg-[#141414] text-[#9a9a9a] hover:text-[#c0c0c0] hover:bg-[#1a1a1a] data-[state=on]:bg-gradient-to-b data-[state=on]:from-[#453957] data-[state=on]:to-[#2e2c4e] data-[state=on]:border-white/[0.1] data-[state=on]:text-[#e0dce8] transition-all duration-200"
                >
                  <span className="text-[13px] font-medium">Auto</span>
                  <div
                    className={`w-[16px] h-[16px] rounded-full flex items-center justify-center transition-all duration-200 ${
                      isAutoMode
                        ? "bg-white/20 text-white/90"
                        : "bg-[#2a2a2a] border border-[#3a3a3a]"
                    }`}
                  >
                    {isAutoMode && (
                      <svg
                        width="9"
                        height="9"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
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
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-[#999999] hover:text-white hover:bg-white/10 rounded-full h-8 w-8 ml-1"
                >
                  <Mic className="h-5 w-5 stroke-[2.5]" />
                </Button>
                <ChatInputSubmitButton
                  className={`rounded-full h-[34px] w-[34px] transition-all flex items-center justify-center shrink-0 [&>svg]:w-[24px] [&>svg]:h-[24px] [&>svg]:stroke-[3] drop-shadow-sm ${hasText ? "bg-gradient-to-b from-white to-[#c0c0c8] text-black shadow hover:brightness-110" : "bg-gradient-to-b from-[#6a6a6a] to-[#454545] text-[#16161a] hover:brightness-110 border border-[#404040]"}`}
                />
              </div>
            </div>
          </ChatInputGroupAddon>
        </ChatInput>
      </div>
    </div>
  );
}
