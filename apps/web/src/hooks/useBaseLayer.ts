"use client";

import { useCallback, useSyncExternalStore } from "react";
import { BASE_LAYERS, DEFAULT_BASE_LAYER, type BaseLayerKey } from "@/components/map/baseLayers";

const STORAGE_KEY = "pk:baseLayer";

function isBaseLayerKey(value: string | null): value is BaseLayerKey {
  return !!value && value in BASE_LAYERS;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): BaseLayerKey {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isBaseLayerKey(stored) ? stored : DEFAULT_BASE_LAYER;
}

function getServerSnapshot(): BaseLayerKey {
  return DEFAULT_BASE_LAYER;
}

export function useBaseLayer() {
  const layer = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setLayer = useCallback((next: BaseLayerKey) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    // The native `storage` event only fires in *other* tabs; dispatching one
    // here is what makes this tab's own useSyncExternalStore subscriber
    // re-read the new value.
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  return [layer, setLayer] as const;
}
