"use client";

import Link from "next/link";
import { useState } from "react";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/password-reset-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Our route always reports success for a well-formed address (never
      // leaks whether the account exists) -- only a malformed address or a
      // server error surfaces as a distinct error message.
      if (!res.ok && res.status !== 400) throw new Error("Failed to send");
      if (!res.ok) {
        setError("Enter a valid email address.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong — try again in a bit.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>

      {sent ? (
        <p className="text-sm text-neutral-600">
          If an account exists for that email, we&apos;ve sent a reset link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Email
            <input
              required
              type="email"
              className="rounded-md border border-neutral-300 px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}

      <p className="text-sm text-neutral-500">
        <Link href="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </main>
  );
}
