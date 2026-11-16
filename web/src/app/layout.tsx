import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";
import { NetworkBanner } from "@/components/NetworkBanner";
import { ToastProvider } from "@/components/toast";
import { I18nProvider } from "@/lib/i18n";
import { WalletProvider } from "@/lib/wallet";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cọc · Neutral rental deposit escrow",
  description: "Rental deposits held in a smart contract on Avalanche, not in anyone's pocket.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a0a0b" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <I18nProvider>
          <WalletProvider>
            <ToastProvider>
              <NetworkBanner />
              <Header />
              <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
            </ToastProvider>
          </WalletProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
