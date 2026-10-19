"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteUserButton({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function remove() {
    if (
      !window.confirm(
        `Permanently delete ${username}? This also removes their login and can't be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to delete user");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-md border border-red-300 px-2 py-1 text-sm text-red-700 disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
