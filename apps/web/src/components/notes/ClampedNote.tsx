"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

// Shows a note up to `maxHeight` px; if the content is taller, it is clipped
// with a fade and a "more..." link to the full note.
export function ClampedNote({
  href,
  maxHeight = 450,
  children,
}: {
  href: string;
  maxHeight?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setClamped(el.scrollHeight > maxHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [maxHeight]);

  return (
    <div>
      <div
        ref={ref}
        className="relative overflow-hidden"
        style={{ maxHeight }}
      >
        {children}
        {clamped && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {clamped && (
        <Link href={href} className="text-sm text-green-700 underline">
          more...
        </Link>
      )}
    </div>
  );
}
