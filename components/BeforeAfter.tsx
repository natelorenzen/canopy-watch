"use client";

import { useState } from "react";

type Box = { x0: number; y0: number; x1: number; y1: number };

// Swipe comparison of the two 256×256 crops with the alert box outlined.
export function BeforeAfter({
  before,
  after,
  box,
  beforeDate,
  afterDate,
}: {
  before: string;
  after: string;
  box?: Box | null;
  beforeDate: string;
  afterDate: string;
}) {
  const [pos, setPos] = useState(50);
  const pct = (v: number) => `${(v / 256) * 100}%`;

  return (
    <div>
      <div className="relative aspect-square w-full select-none overflow-hidden rounded-md border border-line bg-panel-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after} alt={`After, ${afterDate}`} className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before} alt={`Before, ${beforeDate}`} className="h-full w-full [image-rendering:pixelated]" />
        </div>
        {box && (
          <div
            className="pointer-events-none absolute border-2 border-dashed border-alert"
            style={{ left: pct(box.x0), top: pct(box.y0), width: pct(box.x1 - box.x0), height: pct(box.y1 - box.y0) }}
          />
        )}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${pos}%` }} />
        <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px]">before · {beforeDate}</span>
        <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px]">after · {afterDate}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Swipe between before and after"
        className="mt-2 w-full accent-[var(--accent)]"
      />
    </div>
  );
}
