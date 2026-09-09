"use client";

import { useState } from "react";
import { CameraPinIcon } from "./CameraPinIcon";
import { UploadPhotoDialog } from "./UploadPhotoDialog";

export function UploadPhotoButton({ observerName }: { observerName: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Upload new photo"
        className="ml-1 flex items-center gap-1.5 rounded-full bg-neutral-200 px-2 py-1 text-sm font-medium text-neutral-900 hover:bg-neutral-200"
      >
        <CameraPinIcon />
      </button>
      {open && (
        <UploadPhotoDialog observerName={observerName} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
