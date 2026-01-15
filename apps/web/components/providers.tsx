"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TRPCProvider } from "@workspace/trpc/client/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
        enableColorScheme
      >
        {children}
      </NextThemesProvider>
    </TRPCProvider>
  );
}
