"use client";

import {
  getAppleProvider,
  getFacebookProvider,
  getFirebaseAuth,
  getGoogleProvider,
} from "@/lib/firebase-client";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthProvider,
} from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

function loginErrorMessage(err: unknown): string {
  const code = err instanceof Error && "code" in err ? String(err.code) : "";
  switch (code) {
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts — try again later.";
    default:
      return err instanceof Error ? err.message : "Sign-in failed";
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function establishSession(idToken: string) {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw new Error("Failed to create session");
    router.push("/");
    router.refresh();
  }

  async function signInWith(provider: AuthProvider) {
    setError(null);
    setPending(true);
    try {
      const credential = await signInWithPopup(getFirebaseAuth(), provider);
      await establishSession(await credential.user.getIdToken());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setPending(false);
    }
  }

  async function handleEmailPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const credential = await signInWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password,
      );
      await establishSession(await credential.user.getIdToken());
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Sign in to Placekeeping</h1>
      <p className="text-sm text-neutral-500">
        Sign in to add Places, log Observations, and manage your steward
        profile.
      </p>

      <form onSubmit={handleEmailPasswordSubmit} className="flex flex-col gap-4">
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

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-sm text-neutral-500">
        <Link href="/reset-password" className="underline">
          Forgot password?
        </Link>
        {" · "}
        <Link href="/signup" className="underline">
          New here? Sign up
        </Link>
      </p>

      <p className="text-center text-sm text-neutral-400">or</p>

      <button
        disabled={pending}
        onClick={() => signInWith(getGoogleProvider())}
        className="rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50 disabled:opacity-50"
      >
        Continue with Google
      </button>
      <button
        disabled={pending}
        onClick={() => signInWith(getFacebookProvider())}
        className="rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50 disabled:opacity-50"
      >
        Continue with Facebook
      </button>
      <button
        disabled={pending}
        onClick={() => signInWith(getAppleProvider())}
        className="rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50 disabled:opacity-50"
      >
        Continue with Apple
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
