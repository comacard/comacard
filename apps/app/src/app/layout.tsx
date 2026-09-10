import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/Providers";
import "../index.css";

export const metadata: Metadata = {
  title: "Comacard",
  description: "Your onchain history is your credit line.",
  icons: { icon: "/comacard-logo.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
