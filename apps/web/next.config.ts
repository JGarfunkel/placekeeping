import path from "node:path";
import type { NextConfig } from "next";

// This monorepo keeps a single .env / .env.local at the repo root (shared
// with packages/db) rather than duplicating one inside apps/web. Next.js
// only auto-loads env files from its own app directory, so load the root
// ones here explicitly — .env first, then .env.local so it can override,
// matching Next's own precedence.
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(path.resolve(__dirname, "../../", file));
  } catch {
    // File doesn't exist — fine, it's optional.
  }
}

const nextConfig: NextConfig = {
  transpilePackages: [
    "@placekeeping/core",
    "@placekeeping/db",
    "@placekeeping/shared-types",
  ],
  serverExternalPackages: ['exifr'],
  experimental: {
    // Off: Turbopack's dev filesystem cache (on by default since Next
    // 16.1) has repeatedly left deeply-nested dynamic routes (e.g.
    // spots/[a]/[b]/[c]/[d]) out of app-paths-manifest.json after a
    // restart -- a silent 404 with zero application logs, only fixed by
    // deleting .next. Disabling it trades away faster warm restarts for a
    // route manifest that's actually correct.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
