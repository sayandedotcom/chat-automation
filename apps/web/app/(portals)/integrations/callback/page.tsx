"use client";

import { useEffect, useMemo, useState } from "react";

import { useRouter } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { ProcessingOverlay } from "@/components/processing-overlay";
import { integrations } from "@/config/integrations";
import { useTRPC } from "@/lib/trpc";

const MIN_PROCESSING_MS = 2500;
const ERROR_DISPLAY_MS = 3500;

/** Human-readable error messages */
const ERROR_MESSAGES: Record<string, string> = {
  no_code: "No authorization code was received.",
  missing_credentials: "Server credentials are not configured.",
  token_exchange_failed: "Failed to exchange authorization token.",
  oauth_failed: "OAuth authentication failed.",
};

export default function IntegrationCallbackPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { refetch: refetchStatus } = useQuery(trpc.integrations.status.queryOptions());

  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerInfo = useMemo(() => {
    if (!provider) return null;
    const found = integrations.find((i) => i.id === provider);
    return found ? { icon: found.icon, name: found.name } : null;
  }, [provider]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const providerParam = params.get("provider");
    const errorParam = params.get("error");

    if (errorParam) {
      // Show error overlay, then redirect after a delay
      setError(ERROR_MESSAGES[errorParam] || `Integration failed: ${errorParam}`);
      setTimeout(() => {
        router.replace("/integrations");
      }, ERROR_DISPLAY_MS);
      return;
    }

    if (!providerParam) {
      router.replace("/integrations");
      return;
    }

    setProvider(providerParam);

    // Refetch status + enforce minimum display time, then redirect
    const start = Date.now();
    refetchStatus().then(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, MIN_PROCESSING_MS - elapsed);
      setTimeout(() => {
        router.replace("/integrations");
      }, remaining);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Error state
  if (error) {
    return (
      <ProcessingOverlay
        providerIcon={providerInfo?.icon}
        providerName={providerInfo?.name}
        visible={true}
        error={error}
      />
    );
  }

  // Fallback while provider is being read from URL
  if (!provider || !providerInfo) {
    return <div className="fixed inset-0 z-[100] bg-[#08080a]" />;
  }

  return (
    <ProcessingOverlay
      providerIcon={providerInfo.icon}
      providerName={providerInfo.name}
      visible={true}
    />
  );
}
