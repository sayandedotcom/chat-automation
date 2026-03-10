"use client";

import Image from "next/image";

import { Loader2 } from "lucide-react";

import { Button } from "@workspace/ui/components/button";

import type { Integration } from "@/config/integrations";

export function IntegrationCard({
  integration,
  isConnected,
  isLoading,
  onConnect,
  onDisconnect,
}: {
  integration: Integration;
  isConnected: boolean;
  isLoading: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="group flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3.5 transition-colors duration-200 hover:bg-white/[0.03]">
      {/* Icon Container */}
      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-neutral-300/30 bg-white/90 shadow-[inset_0_1px_3px_rgba(255,255,255,0.2)]">
        <Image
          src={integration.icon}
          alt={integration.name}
          width={24}
          height={24}
          className="object-contain"
        />
      </div>

      {/* Text Content */}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="truncate bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-[14px] font-medium text-transparent">
          {integration.name}
        </span>
        <span
          className="mt-0.5 truncate text-[12.5px] text-zinc-500"
          title={integration.description}>
          {integration.description}
        </span>
      </div>

      {/* Connect/Disconnect Button */}
      {integration.isLive ? (
        isConnected ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDisconnect}
            disabled={isLoading}
            className="flex h-9 w-[100px] flex-shrink-0 justify-center rounded-2xl bg-zinc-800/80 text-[14px] font-light text-zinc-300 transition-all duration-200 hover:bg-zinc-700 hover:text-white">
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connected"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onConnect}
            disabled={isLoading}
            className="flex h-9 w-[100px] flex-shrink-0 justify-center rounded-2xl bg-zinc-800 text-[14px] font-light text-zinc-300 transition-all duration-200 hover:bg-zinc-700 hover:text-white">
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
          </Button>
        )
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled
          className="hidden h-9 flex-shrink-0 cursor-not-allowed items-center justify-center rounded-2xl bg-zinc-800/50 px-4 text-[13px] font-medium text-zinc-500 min-[400px]:flex">
          Coming Soon
        </Button>
      )}
    </div>
  );
}
