"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "sent" | "error";

export function ResendVerificationButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("sending");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/auth/verification-email", { method: "POST" });
      if (!res.ok) throw new Error("Failed to send");
      setStatus("sent");
    } catch {
      setStatus("error");
      setErrorMessage("Failed to send. Try again.");
    }
  }

  if (status === "sent") {
    return <p className="text-sm text-amber-900">Sent — check your inbox.</p>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "sending"}
        className="whitespace-nowrap rounded-md border border-amber-300 px-3 py-1.5 text-sm font-medium hover:bg-amber-100 disabled:opacity-50"
      >
        {status === "sending" ? "Sending…" : "Resend verification email"}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
