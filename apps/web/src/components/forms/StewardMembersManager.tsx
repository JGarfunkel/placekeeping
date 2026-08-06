"use client";

import type { StewardMember } from "@placekeeping/shared-types";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function StewardMembersManager({
  stewardId,
  members,
}: {
  stewardId: string;
  members: StewardMember[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/stewards/${stewardId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? "Failed to add member");
      }
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  async function handleRoleChange(userId: string, role: "admin" | "member") {
    setError(null);
    const res = await fetch(`/api/stewards/${stewardId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to update role");
      return;
    }
    router.refresh();
  }

  async function handleRemove(userId: string) {
    setError(null);
    const res = await fetch(`/api/stewards/${stewardId}/members/${userId}`, {
      method: "DELETE",
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to remove member");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">{member.name}</p>
              {member.email && (
                <p className="text-xs text-neutral-500">{member.email}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={member.role}
                onChange={(e) =>
                  handleRoleChange(member.userId, e.target.value as "admin" | "member")
                }
                className="rounded-md border border-neutral-300 px-2 py-1 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
              <button
                type="button"
                onClick={() => handleRemove(member.userId)}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAdd} className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">
          Add member by email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
