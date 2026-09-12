import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { switzer } from "../lib/fonts";
import { ToastProvider } from "../providers/ToastProvider";
import { VaultProvider } from "../providers/VaultProvider";
import { WalletProvider } from "../providers/WalletProvider";
import { Web3Provider } from "../providers/Web3Provider";

export const metadata: Metadata = {
  title: "Comacard",
  description: "A card sized by what you have repaid, not what you hold. Built on Creditcoin.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // wagmi's SSR mode stores the connection in a cookie; handing it to Web3Provider is what lets the
  // server render the connected state instead of an empty one. Reading headers makes this layout
  // dynamic, which is correct: a wallet session is per-request by definition.
  const cookies = (await headers()).get("cookie");

  // suppressHydrationWarning: the wallet modal injects theme CSS vars onto <html> at runtime,
  // which React flags as a hydration mismatch. Standard Next.js escape hatch for third-party
  // html mutation.
  return (
    <html lang="en" className={`${switzer.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Web3Provider cookies={cookies}>
          <WalletProvider>
            <VaultProvider>
              <ToastProvider>{children}</ToastProvider>
            </VaultProvider>
          </WalletProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
