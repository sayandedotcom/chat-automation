"use client";

import { useState, useMemo, useEffect } from "react";
import { Search } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { Input } from "@workspace/ui/components/input";
import { oauthIntegrations, integrations } from "@/config/integrations";

import { ProcessingOverlay } from "@/components/processing-overlay";
import { IntegrationCard } from "@/components/integration-card";

const MIN_PROCESSING_MS = 2500;

export const ContentWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="h-[calc(100vh-1rem)] m-2 w-[calc(100%-1rem)] bg-[#131313] flex flex-col overflow-auto scrollbar-hide border border-white/10 rounded-2xl">
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
