/**
 * tRPC client configuration for Next.js.
 * Re-exports the tRPC hooks and TRPCProvider from @workspace/trpc.
 */

export {
  TRPCProvider,
  useTRPC,
  useTRPCClient,
} from "@workspace/trpc/client/react";
export type { AppRouter } from "@workspace/trpc/client/react";
