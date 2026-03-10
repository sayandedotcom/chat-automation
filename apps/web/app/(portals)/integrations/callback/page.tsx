"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { integrations } from "@/config/integrations";
import { ProcessingOverlay } from "@/components/processing-overlay";

const MIN_PROCESSING_MS = 2500;

export default function IntegrationCallbackPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const { refetch: refetchStatus } = useQuery(trpc.integrations.status.queryOptions());

  const [provider, setProvider] = useState<string | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);

  const providerInfo = useMemo(() => {
    if (!provider) return null;
    const found = integrations.find((i) => i.id === provider);
    return found ? { icon: found.icon, name: found.name } : null;
  }, [provider]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const providerParam = params.get("provider");
    const error = params.get("error");

    if (error) {
      console.error("OAuth error:", error);
      router.replace("/integrations");
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
        setOverlayVisible(false);
        // Wait for fade-out, then navigate
        setTimeout(() => router.replace("/integrations"), 700);
      }, remaining);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fallback while provider is being read from URL
  if (!provider || !providerInfo) {
    return (
      <div className="fixed inset-0 z-[100] bg-[#08080a]" />
    );
  }

  return (
    <ProcessingOverlay
      providerIcon={providerInfo.icon}
      providerName={providerInfo.name}
      visible={overlayVisible}
    />
  );
}
