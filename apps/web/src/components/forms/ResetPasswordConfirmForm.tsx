"use client";

import { PasswordInput } from "@/components/forms/PasswordInput";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function ResetPasswordConfirmForm() {
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");

  const [checking, setChecking] = useState(true);
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setCodeInvalid(true);
      setChecking(false);
      return;
    }
    verifyPasswordResetCode(getFirebaseAuth(), oobCode)
      .then(() => setChecking(false))
      .catch(() => {
        setCodeInvalid(true);
        setChecking(false);
      });
  }, [oobCode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmNewPassword) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    try {
      await confirmPasswordReset(getFirebaseAuth(), oobCode!, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setPending(false);
    }
  }

  if (checking) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
        <p className="text-sm text-neutral-500">Checking reset link…</p>
      </main>
    );
  }

  if (codeInvalid) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="text-sm text-red-600">
          This reset link is invalid or has expired.
        </p>
        <Link href="/reset-password" className="underline">
          Request a new reset link
        </Link>
      </main>
    );
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Password reset</h1>
        <p className="text-sm text-neutral-600">
          Your password has been changed.
        </p>
        <Link href="/login" className="underline">
          Log in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          New password
          <PasswordInput
            required
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Confirm new password
          <PasswordInput
            required
            autoComplete="new-password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
          />
        </label>
        {confirmNewPassword && newPassword !== confirmNewPassword && (
          <p className="-mt-2 text-sm text-red-600">Passwords don&apos;t match.</p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending || (confirmNewPassword !== "" && newPassword !== confirmNewPassword)}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Reset password"}
        </button>
      </form>
    </main>
  );
}
