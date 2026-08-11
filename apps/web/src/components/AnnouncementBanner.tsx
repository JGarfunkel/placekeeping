"use client";

import type { AnnouncementStatus } from "@placekeeping/shared-types";
import { useEffect, useState } from "react";

interface Announcement {
  status: AnnouncementStatus;
  message: string;
}

const STATUS_CLASSES: Record<AnnouncementStatus, string> = {
  log: "border-sky-200 bg-sky-50 text-sky-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

export function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/announcement")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.status && data.message) {
          setAnnouncement({ status: data.status, message: data.message });
        }
      })
      .catch(() => {
        // Non-critical -- just skip showing the banner.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!announcement) return null;

  return (
    <div
      className={`border-b px-6 py-2 text-sm ${STATUS_CLASSES[announcement.status]}`}
    >
      {announcement.message}
    </div>
  );
}
