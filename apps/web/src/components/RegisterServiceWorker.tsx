"use client";

import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    // sw.js caches /_next/static/* cache-first, forever (see public/sw.js) --
    // exactly wrong for dev, where chunk URLs don't reliably change between
    // edits the way production's content-hashed filenames do. Without this
    // gate, a dev browser that's ever registered the worker keeps serving
    // stale JS after every edit, no matter how many times the page reloads.
    if (process.env.NODE_ENV !== "production") {
      // Not registering isn't enough: a worker registered earlier (e.g. by a
      // prod build on this same localhost origin) stays active and keeps
      // serving its cached, stale chunks. Tear it and its caches down.
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => {
            for (const reg of regs) void reg.unregister();
            if (regs.length > 0 && "caches" in window) {
              void caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k)));
            }
          })
          .catch(() => {});
      }
      return;
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return null;
}
