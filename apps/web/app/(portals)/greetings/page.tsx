"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export default function GreetingsPage() {
  const [name, setName] = useState("World");

  // Get the tRPC context
  const trpc = useTRPC();

  // tRPC query using TanStack React Query hooks
  const greetingQuery = useQuery(
    trpc.greeting.hello.queryOptions(
      { name },
      {
        // Only fetch when name is non-empty
        enabled: name.length > 0,
      }
    )
  );

  // Server time query demonstrating Date serialization
  const serverTimeQuery = useQuery(trpc.greeting.getServerTime.queryOptions());

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold">tRPC Greetings Demo</h1>

        {/* Greeting Input */}
        <div className="space-y-4">
          <label className="block text-sm text-gray-400">
            Enter your name:
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-blue-500"
            placeholder="Your name..."
          />
        </div>

        {/* Greeting Result */}
        <div className="p-6 bg-gray-900 rounded-lg border border-gray-800">
          <h2 className="text-lg font-semibold mb-2">Greeting Response</h2>
          {greetingQuery.isLoading ? (
            <p className="text-gray-400">Loading...</p>
          ) : greetingQuery.isError ? (
            <p className="text-red-400">Error: {greetingQuery.error.message}</p>
          ) : (
            <p className="text-green-400 text-xl">{greetingQuery.data}</p>
          )}
        </div>

        {/* Server Time */}
        <div className="p-6 bg-gray-900 rounded-lg border border-gray-800">
          <h2 className="text-lg font-semibold mb-2">
            Server Time (SuperJSON Date)
          </h2>
          {serverTimeQuery.isLoading ? (
            <p className="text-gray-400">Loading...</p>
          ) : serverTimeQuery.isError ? (
            <p className="text-red-400">
              Error: {serverTimeQuery.error.message}
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-blue-400">
                {serverTimeQuery.data?.time.toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">
                Timezone: {serverTimeQuery.data?.timezone}
              </p>
            </div>
          )}
        </div>

        {/* Refetch Button */}
        <button
          onClick={() => {
            greetingQuery.refetch();
            serverTimeQuery.refetch();
          }}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Refetch Data
        </button>
      </div>
    </div>
  );
}
