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
            placeholder=""
            className="text-[#e5e5e5] placeholder:text-transparent min-h-[32px] text-[16px] pt-4 px-5 pb-1 bg-transparent border-none focus-visible:ring-0 font-sans tracking-tight"
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
                  className="h-9 px-4 gap-2.5 rounded-2xl border border-[#3a3a3e] bg-[#222226] text-[#c0c0c8] hover:text-white hover:bg-[#333338] data-[state=on]:bg-gradient-to-r data-[state=on]:from-purple-500/50 data-[state=on]:to-indigo-500/40 data-[state=on]:border-purple-400/40 data-[state=on]:text-white transition-all shadow-sm"
                >
                  <span className="text-[14px] font-medium tracking-wide">Auto</span>
                  <div
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all ${
                      isAutoMode
                        ? "bg-white/30 text-white"
                        : "bg-transparent border border-[#71717a]"
                    }`}
                  >
                    {isAutoMode && (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M2.5 6.5L5 9L9.5 3.5"
                          stroke="currentColor"
                          strokeWidth="2.5"
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
                  <Mic className="h-12 w-12 stroke-[2.5]" />
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
