"use client";

import { FileIcon, Mic } from "lucide-react";
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

export function ChatInputWithMentions({
  onSubmit,
  placeholder = "Type and press enter to start chatting...",
  disabled = false,
}: {
  onSubmit?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
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
        console.log("Submitted parsed:", parsedValue);
        console.log("Members mentioned:", parsedValue.member);
        console.log("Files mentioned:", parsedValue.file);
        if (onSubmit) {
          onSubmit(parsedValue.content);
        }
      },
    });

  useEffect(() => {
    highlightCode(JSON.stringify(parsed, null, 2), "json").then(
      setHighlightedOutput
    );
  }, [parsed]);

  return (
    <div className="w-full flex justify-center items-center pb-8">
      <div className="w-full max-w-2xl relative">
        <ChatInput
          onSubmit={handleSubmit}
          value={value}
          onChange={onChange}
          className="bg-[#0a0a0c] border border-[#1a1a1e] rounded-3xl shadow-2xl"
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
            className="text-neutral-200 placeholder:text-neutral-500 min-h-[28px] text-sm"
            disabled={disabled}
          />

          {/* Bottom: Actions bar */}
          <ChatInputGroupAddon
            align="block-end"
            className="flex items-center justify-between px-4 pb-4 pt-0"
          >
            {/* Left side: Plus button and Auto toggle */}
            <div className="flex items-center gap-2">
              <ChatInputMentionButton
                variant="ghost"
                className="text-neutral-400 hover:text-white hover:bg-white/10 rounded-full h-9 w-9 p-0"
              />

              <Toggle
                variant="outline"
                size="sm"
                pressed={isAutoMode}
                onPressedChange={setIsAutoMode}
                className="h-8 px-3 gap-2 rounded-full border-[#2a2a2e] bg-[#1a1a1e] text-neutral-400 hover:text-neutral-200 hover:bg-[#2a2a2e] data-[state=on]:bg-[#2a2a2e] data-[state=on]:text-neutral-200"
              >
                <span className="text-xs font-medium">Auto</span>
                <div
                  className={`w-3 h-3 rounded-sm border ${
                    isAutoMode
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-neutral-500"
                  } transition-colors flex items-center justify-center`}
                >
                  {isAutoMode && (
                    <svg
                      width="6"
                      height="4"
                      viewBox="0 0 8 6"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1 3L3 5L7 1"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              </Toggle>
            </div>

            {/* Right side: Mic and Submit buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-neutral-400 hover:text-white hover:bg-white/10 rounded-full h-9 w-9"
              >
                <Mic className="h-4 w-4" />
              </Button>
              <ChatInputSubmitButton
                className="bg-white hover:bg-neutral-200 text-black rounded-full h-9 w-9 shadow-md"
                disabled={disabled}
              />
            </div>
          </ChatInputGroupAddon>
        </ChatInput>
      </div>
    </div>
  );
}
