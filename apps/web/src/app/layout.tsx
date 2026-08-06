import { getAppSettings, type AuthContext } from "@placekeeping/core";
import { isDatabaseConnectionError } from "@placekeeping/db";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "./globals.css";
import { DatabaseWarningBanner } from "@/components/DatabaseWarningBanner";
import { PauseBanner } from "@/components/PauseBanner";
import { LogoutButton } from "@/components/forms/LogoutButton";
import { getAuthContext } from "@/lib/session";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Placekeeping — Community Stewardship Atlas",
  description:
    "Find and steward gardens, preserves, and other cared-for outdoor places near you.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {dbUnavailable && <DatabaseWarningBanner />}
        {!dbUnavailable && writesPaused && <PauseBanner />}
        <header className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 text-sm">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no optimization needed */}
            <img
              src="/brand/wordmark.svg"
              alt="Placekeeping"
              width={182}
              height={33}
            />
          </Link>
          <Link href="/about" className="text-sm underline">
            About
          </Link>

          {authContext ? (
            <span className="flex items-center gap-4">
              {authContext.isSystemAdmin && (
                <Link href="/admin" className="underline">
                  Admin
                </Link>
              )}
              <span className="flex flex-col items-end">
                <Link href="/me" className="underline">
                  My profile
                </Link>
                <LogoutButton className="underline text-neutral-500 hover:text-neutral-900" />
              </span>
            </span>
          ) : (
            <Link href="/login" className="underline">
              Sign in
            </Link>
          )}
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </body>
    </html>
  );
}
