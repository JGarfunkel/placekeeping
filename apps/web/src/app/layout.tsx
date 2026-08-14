import { getAppSettings, type AuthContext } from "@placekeeping/core";
import { isDatabaseConnectionError } from "@placekeeping/db";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "./globals.css";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { DatabaseWarningBanner } from "@/components/DatabaseWarningBanner";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { HeaderMenu } from "@/components/nav/HeaderMenu";
import { PauseBanner } from "@/components/PauseBanner";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { getAuthContext } from "@/lib/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Placekeeping — Community Stewardship Atlas",
  description:
    "Find and steward gardens, preserves, and other cared-for outdoor places near you.",
  appleWebApp: {
    capable: true,
    title: "Placekeeping",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#2e7d43",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let authContext: AuthContext | null = null;
  let dbUnavailable = false;
  let writesPaused = false;
  try {
    [authContext, writesPaused] = await Promise.all([
      getAuthContext(),
      getAppSettings().then((s) => s.writesPaused),
    ]);
  } catch (error) {
    if (!isDatabaseConnectionError(error)) throw error;
    dbUnavailable = true;
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <GoogleAnalytics />
        {dbUnavailable && <DatabaseWarningBanner />}
        {!dbUnavailable && writesPaused && <PauseBanner />}
        <AnnouncementBanner />
        <header className="relative z-[1100] flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3 text-sm">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed */}
            <img
              src="/brand/wordmark.svg"
              alt="Placekeeping"
              width={182}
              height={33}
            />
          </Link>
          <HeaderMenu
            isAuthenticated={authContext !== null}
            isSystemAdmin={authContext?.isSystemAdmin ?? false}
          />
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
