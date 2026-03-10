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
    <div className="flex items-center gap-4 px-4 py-3.5 rounded-xl hover:bg-white/[0.03] transition-colors duration-200 cursor-pointer group">
      {/* Icon Container */}
      <div className="w-11 h-11 rounded-xl bg-white/90 border border-neutral-300/30 flex items-center justify-center flex-shrink-0 shadow-[inset_0_1px_3px_rgba(255,255,255,0.2)]">
        <Image
          src={integration.icon}
          alt={integration.name}
          width={24}
          height={24}
          className="object-contain"
        />
      </div>

      {/* Text Content */}
      <div className="flex flex-col flex-1 min-w-0 justify-center">
        <span className="text-[14px] font-medium bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-400 truncate">
          {integration.name}
        </span>
        <span
          className="text-[12.5px] text-zinc-500 truncate mt-0.5"
          title={integration.description}
        >
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
            className="h-9 w-[100px] flex justify-center text-[14px] font-light bg-zinc-800/80 rounded-2xl text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all duration-200 flex-shrink-0"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connected"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onConnect}
            disabled={isLoading}
            className="h-9 w-[100px] flex justify-center text-[14px] font-light bg-zinc-800 rounded-2xl text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all duration-200 flex-shrink-0"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect"}
          </Button>
        )
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled
          className="h-9 px-4 text-[13px] font-medium bg-zinc-800/50 rounded-2xl text-zinc-500 flex-shrink-0 cursor-not-allowed hidden min-[400px]:flex items-center justify-center"
        >
          Coming Soon
        </Button>
      )}
    </div>
  );
}
