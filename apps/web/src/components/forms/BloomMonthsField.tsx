"use client";

import { BLOOM_MONTH_LABELS, bloomMonthValues, type BloomMonth } from "@placekeeping/shared-types";
import { useRef } from "react";

// Twelve independent cells, tapped or dragged to paint the months a spot is
// known to bloom in -- see local/reclassification-plan.md's Bloom section
// and local/reclassification-bloom.md. Independent cells (rather than a
// single from/to range) keep the gap case reachable, e.g. a summer dearth
// like {5,6,9}. Writes spots.bloomMonths directly.
export function BloomMonthsInput({
  value,
  onChange,
}: {
  value: number[];
  onChange: (months: number[]) => void;
}) {
  // Whether the drag/touch in progress is painting cells on or off, set by
  // the first cell it touches -- null when no gesture is active.
  const paintingRef = useRef<boolean | null>(null);

  function setMonth(month: BloomMonth, on: boolean) {
    const next = new Set(value);
    if (on) next.add(month);
    else next.delete(month);
    onChange([...next].sort((a, b) => a - b));
  }

  function startPaint(month: BloomMonth) {
    const add = !value.includes(month);
    paintingRef.current = add;
    setMonth(month, add);
  }

  function continuePaint(month: BloomMonth) {
    if (paintingRef.current === null) return;
    setMonth(month, paintingRef.current);
  }

  function endPaint() {
    paintingRef.current = null;
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (paintingRef.current === null) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const month = el?.dataset.bloomMonth;
    if (month) continuePaint(Number(month) as BloomMonth);
  }

  return (
    <div
      className="grid grid-cols-12 gap-0.5 select-none"
      onMouseUp={endPaint}
      onMouseLeave={endPaint}
      onTouchEnd={endPaint}
      onTouchMove={handleTouchMove}
    >
      {bloomMonthValues.map((month) => {
        const on = value.includes(month);
        return (
          <button
            key={month}
            type="button"
            data-bloom-month={month}
            aria-pressed={on}
            className={`rounded border px-0.5 py-1.5 text-[11px] ${
              on
                ? "border-pink-600 bg-pink-100 text-pink-900"
                : "border-neutral-300 bg-white text-neutral-600"
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              startPaint(month);
            }}
            onMouseEnter={() => continuePaint(month)}
            onTouchStart={() => startPaint(month)}
          >
            {BLOOM_MONTH_LABELS[month]}
          </button>
        );
      })}
    </div>
  );
}

// "Aug, Sep" for the read-only display -- always in calendar order
// regardless of the order months were painted in.
export function formatBloomMonths(months: number[]): string | null {
  if (months.length === 0) return null;
  return [...months]
    .sort((a, b) => a - b)
    .map((m) => BLOOM_MONTH_LABELS[m as BloomMonth])
    .join(", ");
}
