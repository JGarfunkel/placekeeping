"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function WritesPauseToggle({
  initialPaused,
}: {
  initialPaused: boolean;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(initialPaused);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writesPaused: !paused }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to update setting");
      setPaused(body.settings.writesPaused);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Writes are currently{" "}
        <strong>{paused ? "paused" : "enabled"}</strong>.{" "}
        {paused
          ? "Spot/observation/site/steward create, update, and delete requests are being rejected with a 503."
          : "The site is operating normally."}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`w-fit rounded-md px-4 py-2 font-medium text-white disabled:opacity-50 ${
          paused ? "bg-neutral-900" : "bg-red-600"
        }`}
      >
        {pending
          ? "Working…"
          : paused
            ? "Resume writes"
            : "Pause writes for upgrade"}
      </button>
    </div>
  );
}
