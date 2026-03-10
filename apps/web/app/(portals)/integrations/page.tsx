"use client";

import { useEffect, useMemo, useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Input } from "@workspace/ui/components/input";

import { IntegrationCard } from "@/components/integration-card";
import { ProcessingOverlay } from "@/components/processing-overlay";

import { useTRPC } from "@/lib/trpc";

import { integrations, oauthIntegrations } from "@/config/integrations";

const MIN_PROCESSING_MS = 2500;

export const ContentWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="scrollbar-hide m-2 flex h-[calc(100vh-1rem)] w-[calc(100%-1rem)] flex-col overflow-auto rounded-2xl border border-white/10 bg-[#131313]">
      {children}
    </div>
  );
};

export default function IntegrationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [processingProvider, setProcessingProvider] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);

  const trpc = useTRPC();
  const { data: connectionStatus = {}, refetch: refetchStatus } = useQuery(
    trpc.integrations.status.queryOptions()
  );
  const disconnectMutation = useMutation(trpc.integrations.disconnect.mutationOptions());

  // Resolve provider ID → icon and name from config
  const providerInfo = useMemo(() => {
    if (!processingProvider) return null;
    const found = integrations.find((i) => i.id === processingProvider);
    return found ? { icon: found.icon, name: found.name } : null;
  }, [processingProvider]);

  // Handle success/error params from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success) {
      // Show overlay immediately
      setProcessingProvider(success);
      setOverlayVisible(true);

      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);

      // Refetch status + enforce minimum display time
      const start = Date.now();
      refetchStatus().then(() => {
        const elapsed = Date.now() - start;
        const remaining = Math.max(0, MIN_PROCESSING_MS - elapsed);
        setTimeout(() => {
          // Fade out then remove
          setOverlayVisible(false);
          setTimeout(() => setProcessingProvider(null), 700);
        }, remaining);
      });
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
    <>
      {/* Processing overlay */}
      {processingProvider && providerInfo && (
        <ProcessingOverlay
          providerIcon={providerInfo.icon}
          providerName={providerInfo.name}
          visible={overlayVisible}
        />
      )}

      <ContentWrapper>
        <div className="relative min-h-screen bg-[#0A0A0A]">
          {/* Background Glow and Gradient */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[500px]">
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.08] via-white/[0.02] to-transparent" />
            <div className="absolute top-0 left-1/2 h-[100px] w-[1000px] -translate-x-1/2 rounded-[100%] bg-white/[0.06] blur-[120px]" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 py-20 lg:px-12">
            {/* Header */}
            <div className="mb-10 space-y-3 text-center">
              <h1 className="bg-gradient-to-b from-white to-neutral-400 bg-clip-text text-[32px] font-medium tracking-tight text-transparent md:text-4xl">
                Integrations
              </h1>
              <p className="bg-gradient-to-b from-neutral-300 to-neutral-500 bg-clip-text text-[15px] text-transparent">
                Connect the tools you want to use with chat ai.
              </p>
            </div>

            {/* Search Bar */}
            <div className="relative mx-auto mb-16 max-w-2xl">
              <Search className="absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500" />
              <Input
                type="text"
                placeholder="Search for integration"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-11 w-full rounded-full border border-zinc-800/50 bg-zinc-900/30 pr-5 pl-11 text-[14px] text-white transition-all duration-200 placeholder:text-zinc-500 focus:border-zinc-700 focus:bg-zinc-900/50 focus:ring-0 focus:ring-offset-0"
              />
            </div>

            {/* Integrations Section */}
            <section className="mt-4 flex flex-col gap-10">
              {filteredIntegrations.filter((i) => connectionStatus[i.id]).length > 0 && (
                <div className="space-y-4">
                  <h2 className="px-1 text-[15px] font-semibold text-white/90">Connected</h2>
                  <div className="rounded-[24px] border border-white/5 bg-[#191919] p-4 md:p-6">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2 lg:grid-cols-3 xl:gap-x-8">
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
                  <h2 className="px-1 text-[15px] font-semibold text-white/90">Productivity</h2>
                  <div className="grid grid-cols-1 gap-x-6 gap-y-2 px-1 md:grid-cols-2 lg:grid-cols-3 xl:gap-x-8">
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
                <div className="py-16 text-center">
                  <p className="text-base text-zinc-500">
                    No integrations found matching &quot;{searchQuery}&quot;
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      </ContentWrapper>
    </>
  );
}
