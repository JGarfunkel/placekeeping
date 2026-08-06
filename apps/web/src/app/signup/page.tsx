"use client";

import { getFirebaseAuth } from "@/lib/firebase-client";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function signupErrorMessage(err: unknown): string {
  const code = err instanceof Error && "code" in err ? String(err.code) : "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Log in instead.";
    case "auth/weak-password":
      return "Choose a stronger password (at least 6 characters).";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    default:
      return err instanceof Error ? err.message : "Sign-up failed";
  }
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setPending(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password,
      );
      await updateProfile(credential.user, { displayName: name });
      // Force-refresh so the ID token's cached `name` claim reflects the
      // updateProfile call above -- /api/auth/session reads decoded.name.
      await credential.user.getIdToken(true);

      const idToken = await credential.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) throw new Error("Failed to create session");

      // Best-effort -- account creation already succeeded, and the
      // not-verified banner + ResendVerificationButton on /me cover a
      // failed/missed send.
      fetch("/api/auth/verification-email", { method: "POST" }).catch(() => {});

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(signupErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="text-sm text-neutral-500">
        Sign up to add Places, log Observations, and manage your steward
        profile.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            required
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

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

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            required
            type="password"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Confirm password
          <input
            required
            type="password"
            className="rounded-md border border-neutral-300 px-3 py-2"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
