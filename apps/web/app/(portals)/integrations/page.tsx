"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { Search, Check, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { oauthIntegrations, type Integration } from "@/config/integrations";

function IntegrationCard({
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
      <div className="w-11 h-11 rounded-xl bg-zinc-800/80 flex items-center justify-center flex-shrink-0">
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
        <span className="text-[14px] font-medium text-zinc-100 truncate">{integration.name}</span>
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
            className="h-9 px-4 text-[13px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-red-500/10 hover:text-red-500 transition-all duration-200 flex-shrink-0 rounded-lg flex items-center"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Check className="w-3.5 h-3.5 mr-1" />
                Connected
              </>
            )}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onConnect}
            disabled={isLoading}
            className="h-9 px-5 text-[13px] font-medium bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all duration-200 flex-shrink-0 rounded-lg"
          >
            {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Connect"}
          </Button>
        )
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled
          className="h-9 px-4 text-[13px] font-medium bg-zinc-800/40 text-zinc-600 flex-shrink-0 rounded-lg cursor-not-allowed hidden min-[400px]:flex items-center justify-center"
        >
          Coming Soon
        </Button>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

  const trpc = useTRPC();
  const { data: connectionStatus = {}, refetch: refetchStatus } = useQuery(
    trpc.integrations.status.queryOptions()
  );
  const disconnectMutation = useMutation(trpc.integrations.disconnect.mutationOptions());

  // Handle success/error params from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success) {
      refetchStatus();
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (error) {
      console.error("OAuth error:", error);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = (integrationId: string) => {
    setLoadingStates((prev) => ({ ...prev, [integrationId]: true }));
    const apiUrl = process.env.NEXT_PUBLIC_API_URL as string;
    window.location.href = `${apiUrl}/oauth/${integrationId}`;
  };

  const handleDisconnect = async (integrationId: string) => {
    setLoadingStates((prev) => ({ ...prev, [integrationId]: true }));
    try {
      await disconnectMutation.mutateAsync({ provider: integrationId });
      refetchStatus();
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setLoadingStates((prev) => ({ ...prev, [integrationId]: false }));
    }
  };

  const filteredIntegrations = useMemo(() => {
    if (!searchQuery.trim()) return oauthIntegrations;

    return oauthIntegrations.filter(
      (i) =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-white/[0.03] blur-[100px] rounded-[100%] pointer-events-none" />

      <div className="max-w-[1400px] w-full mx-auto px-6 lg:px-12 py-20 relative z-10">
        {/* Header */}
        <div className="text-center space-y-3 mb-10">
          <h1 className="text-[32px] md:text-4xl font-medium text-zinc-100 tracking-tight">
            Integrations
          </h1>
          <p className="text-zinc-300 text-[15px]">
            Connect the tools you want to use with Dimension.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-2xl mx-auto mb-16">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-zinc-500" />
          <Input
            type="text"
            placeholder="Search for integration"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-11 pl-11 pr-5 bg-zinc-900/30 border border-zinc-800/50 rounded-full text-[14px] text-zinc-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:bg-zinc-900/50 focus:ring-0 focus:ring-offset-0 transition-all duration-200"
          />
        </div>

        {/* Integrations Section */}
        <section className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 xl:gap-x-8 gap-y-1 mt-4">
            {filteredIntegrations.map((integration) => (
              <IntegrationCard
                key={integration.id}
                integration={integration}
                isConnected={connectionStatus[integration.id] || false}
                isLoading={loadingStates[integration.id] || false}
                onConnect={() => handleConnect(integration.id)}
                onDisconnect={() => handleDisconnect(integration.id)}
              />
            ))}
          </div>

          {filteredIntegrations.length === 0 && (
            <div className="text-center py-16">
              <p className="text-zinc-500 text-base">
                No integrations found matching "{searchQuery}"
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
