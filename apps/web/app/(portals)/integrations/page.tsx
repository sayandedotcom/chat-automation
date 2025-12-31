"use client";

import { useState, useMemo } from "react";
import Image from "next/image";
import { Search } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { integrations, type Integration } from "@/config/integrations";

function IntegrationCard({ integration }: { integration: Integration }) {
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

      {/* Connect Button */}
      <Button
        variant="outline"
        size="sm"
        className="h-9 px-5 text-[13px] font-medium bg-transparent border-zinc-700 text-zinc-300 hover:bg-white hover:border-white transition-all duration-200 flex-shrink-0 rounded-lg"
      >
        Connect
      </Button>
    </div>
  );
}

export default function IntegrationsPage() {
  const [searchQuery, setSearchQuery] = useState("");

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
              <IntegrationCard key={integration.id} integration={integration} />
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
