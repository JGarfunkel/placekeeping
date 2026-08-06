"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PhotoUploadField } from "./PhotoUploadField";

// Saves immediately on upload/URL selection (no separate submit button) --
// unlike StewardProfileForm, this is the only field in the form, so there's
// nothing to batch it with.
export function ProfilePhotoForm({ photoUrl }: { photoUrl: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(photoUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleChange(nextValue: string) {
    setValue(nextValue);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrl: nextValue || null }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          typeof body?.error === "string"
            ? body.error
            : "Failed to update profile photo",
        );
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <PhotoUploadField
        label="Profile photo"
        value={value}
        onChange={handleChange}
        rounded
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-700">Saved.</p>}
    </div>
  );
}
