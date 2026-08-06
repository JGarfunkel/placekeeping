"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function BecomeStewardButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/stewards/me", { method: "POST" });
      if (!res.ok) throw new Error("Failed to sign up as a steward");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-fit rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Signing up…" : "Become a steward"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
