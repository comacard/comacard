"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { type Config, cookieToInitialState, WagmiProvider } from "wagmi";
import { getAppKit } from "../lib/comacard/appkit";
import { wagmiConfig } from "../lib/comacard/wagmi";

/**
 * Wallet plumbing for the whole app: wagmi, react-query, and the AppKit modal.
 *
 * The modal itself is built in `lib/comacard/appkit.ts` and warmed here rather than created in this
 * file, so nothing touches the connector stack during server rendering. See that file for why.
 */
export function Web3Provider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  // One client per mount, created lazily. A module-scope QueryClient is shared across every request
  // on the server, which leaks one user's cached reads into another's render.
  const [queryClient] = useState(() => new QueryClient());

  // Build the modal ahead of the first tap. Client-only by construction: effects never run on the
  // server. Failures are swallowed here because `connect()` surfaces them where the user can see.
  useEffect(() => {
    void getAppKit().catch(() => undefined);
  }, []);

  // Rehydrates wagmi from the connection cookie the adapter wrote, so the server and the first
  // client render agree about whether a wallet is connected. Without it, `ssr: true` still produces
  // a hydration mismatch on every reload that has a live session.
  const initialState = cookieToInitialState(wagmiConfig as Config, cookies);

  return (
    <WagmiProvider config={wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
