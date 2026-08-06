"use client";

import { useEffect, useRef, useState } from "react";
import { BASE_LAYERS, type BaseLayerKey } from "./baseLayers";

const LAYER_ORDER: BaseLayerKey[] = ["aerial", "streets", "osm", "google"];

// Shared stacked-layers control for both the Leaflet and Google render
// trees. Leaflet's own LayersControl can't host the Google option (it isn't
// a TileLayer), and Google has no equivalent control at all, so this is a
// plain overlay rather than either library's native control.
export function LayerSwitcher({
  layer,
  onChange,
}: {
  layer: BaseLayerKey;
  onChange: (layer: BaseLayerKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-[1000]">
      <button
        type="button"
        aria-label="Choose map layer"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-700 shadow-sm hover:bg-neutral-50"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2 2 7l10 5 10-5-10-5Z" strokeLinejoin="round" />
          <path d="m2 17 10 5 10-5" strokeLinejoin="round" />
          <path d="m2 12 10 5 10-5" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="radiogroup"
          aria-label="Map layer"
          className="mt-1 min-w-[140px] rounded-md border border-neutral-300 bg-white p-1 shadow-md"
        >
          {LAYER_ORDER.map((key) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-neutral-50"
            >
              <input
                type="radio"
                name="pk-base-layer"
                checked={layer === key}
                onChange={() => {
                  onChange(key);
                  setOpen(false);
                }}
              />
              {BASE_LAYERS[key].label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
