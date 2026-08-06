"use client";

import { useRouter } from "next/navigation";

const defaultClassName =
  "w-fit rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-50";

export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/session", { method: "DELETE" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className={className ?? defaultClassName}
    >
      Log out
    </button>
  );
}
