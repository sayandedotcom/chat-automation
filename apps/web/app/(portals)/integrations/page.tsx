"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { Search, Check, Loader2 } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { integrations, type Integration } from "@/config/integrations";

type ConnectionStatus = Record<string, boolean>;

// OAuth-supported integrations
const OAUTH_INTEGRATIONS = [
  "gmail",
  "google-docs",
  "google-drive",
  "vercel",
  "notion",
];

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
  const hasOAuth = OAUTH_INTEGRATIONS.includes(integration.id);

  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/60 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-300 cursor-pointer group">
      {/* Icon Container */}
      <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
        <Image
          src={integration.icon}
          alt={integration.name}
          width={26}
          height={26}
          className="object-contain"
        />
      </div>

      {/* Text Content */}
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-[15px] font-medium text-white truncate">
          {integration.name}
        </span>
        <span className="text-[13px] text-zinc-500 truncate leading-relaxed">
          {integration.description}
        </span>
      </div>

      {/* Connect/Disconnect Button */}
      {hasOAuth ? (
        isConnected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            disabled={isLoading}
            className="h-9 px-5 text-[13px] font-medium bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all duration-200 flex-shrink-0 rounded-lg"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 mr-1.5" />
                Connected
              </>
            )}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onConnect}
            disabled={isLoading}
            className="h-9 px-5 text-[13px] font-medium bg-transparent border-zinc-700 text-zinc-300 hover:bg-white hover:border-white hover:text-black transition-all duration-200 flex-shrink-0 rounded-lg"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Connect"
            )}
          </Button>
        )
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled
          className="h-9 px-5 text-[13px] font-medium bg-transparent border-zinc-800 text-zinc-600 flex-shrink-0 rounded-lg cursor-not-allowed"
        >
          Coming Soon
        </Button>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    {}
  );
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>(
    {}
  );

  // Fetch connection status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/auth/status");
        if (response.ok) {
          const status = await response.json();
          setConnectionStatus(status);
        }
      } catch (error) {
        console.error("Failed to fetch connection status:", error);
      }
    };

    fetchStatus();

    // Check for success/error params from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const error = params.get("error");

    if (success) {
      setConnectionStatus((prev) => ({ ...prev, [success]: true }));
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (error) {
      console.error("OAuth error:", error);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleConnect = (integrationId: string) => {
    setLoadingStates((prev) => ({ ...prev, [integrationId]: true }));
    // Redirect to OAuth flow
    window.location.href = `/api/auth/${integrationId}`;
  };

  const handleDisconnect = async (integrationId: string) => {
    setLoadingStates((prev) => ({ ...prev, [integrationId]: true }));
    try {
      const response = await fetch("/api/auth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: integrationId }),
      });

      if (response.ok) {
        setConnectionStatus((prev) => ({ ...prev, [integrationId]: false }));
      }
    } catch (error) {
      console.error("Failed to disconnect:", error);
    } finally {
      setLoadingStates((prev) => ({ ...prev, [integrationId]: false }));
    }
  };

  const filteredIntegrations = useMemo(() => {
    if (!searchQuery.trim()) return integrations;

    return integrations.filter(
      (i) =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto px-8 py-20">
        {/* Header */}
        <div className="text-center space-y-4 mb-14">
          <h1 className="text-5xl font-semibold text-white tracking-tight">
            Integrations
          </h1>
          <p className="text-zinc-500 text-base">
            Connect the tools you want to use with Dimension.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-2xl mx-auto mb-16">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <Input
            type="text"
            placeholder="Search for integration"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-14 pl-14 pr-6 bg-zinc-900/50 border-zinc-800 rounded-2xl text-base text-white placeholder:text-zinc-600 focus:border-zinc-600 focus:ring-0 focus:ring-offset-0 transition-all duration-200"
          />
        </div>

        {/* Apps Section */}
        <section className="space-y-6">
          <h2 className="text-base font-medium text-zinc-400 tracking-wide px-1">
            Apps
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
