import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { AppProviders } from "@/providers/AppProviders";

export const metadata: Metadata = {
  title: "Capex Pro",
  description: "CAPEX project tracking — Siloam Hospitals",
  icons: {
    icon: "/capex-pro-favicon.svg",
  },
};

/** Per-request CSP nonce from middleware only works on dynamic SSR. */
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Bind middleware x-nonce + request CSP to Next framework scripts during SSR.
  await headers();

  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="stylesheet" href="/css/google-fonts.css" />
      </head>
      <body className="min-h-full font-sans">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
