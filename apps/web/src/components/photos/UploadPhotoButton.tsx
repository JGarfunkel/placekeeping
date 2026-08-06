"use client";

import { useState } from "react";
import { UploadPhotoDialog } from "./UploadPhotoDialog";

export function UploadPhotoButton({ observerName }: { observerName: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-1 rounded-full bg-neutral-900 px-3 py-1 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Upload new photo
      </button>
      {open && (
        <UploadPhotoDialog observerName={observerName} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
