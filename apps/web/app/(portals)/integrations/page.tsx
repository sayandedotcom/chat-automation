"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { Search, Check, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { oauthIntegrations, type Integration } from "@/config/integrations";

// Wrapper that conditionally shows background or solid black
const ContentWrapper = ({ children }: { children: React.ReactNode }) => {
  // Show planetary background when idle
  return (
    <div className="h-[calc(100vh-1rem)] m-2 w-[calc(100%-1rem)] bg-[#131313] flex flex-col overflow-auto scrollbar-hide border border-white/10 rounded-2xl">
      {children}
    </div>
  );
};

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
      <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
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
    <ContentWrapper>
      <div className="min-h-screen bg-[#0A0A0A] relative">
        {/* Background Glow and Gradient */}
        <div className="absolute top-0 inset-x-0 h-[500px] pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] via-white/[0.02] to-transparent" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[100px] bg-white/[0.06] blur-[120px] rounded-[100%]" />
        </div>

        <div className="max-w-[1400px] w-full mx-auto px-6 lg:px-12 py-20 relative z-10">
          {/* Header */}
          <div className="text-center space-y-3 mb-10">
            <h1 className="text-[32px] md:text-4xl font-medium bg-clip-text text-transparent bg-gradient-to-b from-white to-neutral-400 tracking-tight">
              Integrations
            </h1>
            <p className="bg-clip-text text-transparent bg-gradient-to-b from-neutral-300 to-neutral-500 text-[15px]">
              Connect the tools you want to use with chat ai.
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
              className="w-full h-11 pl-11 pr-5 bg-zinc-900/30 border border-zinc-800/50 rounded-full text-[14px] text-white placeholder:text-zinc-500 focus:border-zinc-700 focus:bg-zinc-900/50 focus:ring-0 focus:ring-offset-0 transition-all duration-200"
            />
          </div>

          {/* Integrations Section */}
          <section className="flex flex-col gap-10 mt-4">
            {filteredIntegrations.filter((i) => connectionStatus[i.id]).length > 0 && (
              <div className="space-y-4">
                <h2 className="text-[15px] font-semibold text-white/90 px-1">Connected</h2>
                <div className="bg-[#191919] border border-white/5 rounded-[24px] p-4 md:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 xl:gap-x-8 gap-y-2">
                    {filteredIntegrations
                      .filter((i) => connectionStatus[i.id])
                      .map((integration) => (
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
                </div>
              </div>
            )}

            {filteredIntegrations.filter((i) => !connectionStatus[i.id]).length > 0 && (
              <div className="space-y-4">
                <h2 className="text-[15px] font-semibold text-white/90 px-1">Productivity</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 xl:gap-x-8 gap-y-2 px-1">
                  {filteredIntegrations
                    .filter((i) => !connectionStatus[i.id])
                    .map((integration) => (
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
              </div>
            )}

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
    </ContentWrapper>
  );
}
