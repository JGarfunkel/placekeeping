"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function UsernameForm({ username }: { username: string }) {
  const router = useRouter();
  const [value, setValue] = useState(username);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Failed to update username",
        );
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        Username
        <input
          required
          minLength={3}
          maxLength={40}
          pattern="[a-zA-Z0-9_-]+"
          title="Letters, numbers, underscores, and hyphens only"
          className="rounded-md border border-neutral-300 px-3 py-2"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <p className="text-xs text-neutral-500">
        Shown in place of your name anywhere other people see your activity.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-700">Saved.</p>}

      <div>
        <button
          type="submit"
          disabled={pending || value === username}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save username"}
        </button>
      </div>
    </form>
  );
}
