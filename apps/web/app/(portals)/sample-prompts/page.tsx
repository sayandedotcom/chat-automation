"use client";

import { useCallback, useState } from "react";

import Image from "next/image";

import { Check, Copy, FileText } from "lucide-react";

import { integrations } from "@/config/integrations";

import samplePromptsData from "../../../data/sample-prompts.json";

type PromptItem = {
  prompt: string;
  mcps?: string[];
};

type SamplePrompts = PromptItem[];

const samplePrompts = samplePromptsData as SamplePrompts;

const mcpIconMap = Object.fromEntries(
  integrations.map((i) => [i.id, { icon: i.icon, name: i.name }])
);

export default function SamplePromptsPage() {
  return (
    <div className="m-2 flex h-[calc(100vh-1rem)] w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#131313]">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex items-center gap-3">
            <FileText className="h-8 w-8 text-zinc-400" />
            <div>
              <h1 className="text-2xl font-semibold text-white">Sample Prompts</h1>
              <p className="text-sm text-zinc-400">
                Example prompts to help you get started. Click to copy any prompt.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {samplePrompts.map((item, index) => (
              <PromptCard key={index} prompt={item.prompt} mcps={item.mcps} index={index + 1} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptCard({ prompt, mcps, index }: { prompt: string; mcps?: string[]; index: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [prompt]);

  return (
    <div className="group relative rounded-xl border border-white/[0.06] bg-[#1a1a1a] p-4 transition-all hover:border-white/[0.12]">
      <div className="flex items-start gap-4">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-xs font-medium text-zinc-400">
          {index}
        </div>
        <div className="flex-1">
          <p className="text-sm leading-relaxed text-zinc-200">{prompt}</p>
          {mcps && mcps.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {mcps.map((mcp) => {
                const mcpInfo = mcpIconMap[mcp];
                if (!mcpInfo) return null;
                return (
                  <div
                    key={mcp}
                    className="flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-1"
                    title={mcpInfo.name}>
                    <Image
                      src={mcpInfo.icon}
                      alt={mcpInfo.name}
                      width={14}
                      height={14}
                      className="h-3.5 w-3.5 object-contain"
                    />
                    <span className="text-xs text-zinc-400">{mcpInfo.name}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-zinc-400 transition-all hover:bg-white/[0.12] hover:text-white"
          title="Copy to clipboard">
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
