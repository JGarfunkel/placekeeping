import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verification link invalid — Placekeeping",
};

const REASON_MESSAGES: Record<string, string> = {
  expired: "This verification link has expired. You can create a new steward record to get a fresh one.",
  invalid: "This verification link is invalid. It may have already been used.",
};

export default async function StewardVerifyFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const message = REASON_MESSAGES[reason ?? ""] ?? REASON_MESSAGES.invalid;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <h1 className="text-2xl font-semibold">Verification link invalid</h1>
      <p className="text-sm text-neutral-500">{message}</p>
    </main>
  );
}
