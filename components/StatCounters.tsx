"use client";

import { useEffect, useRef, useState } from "react";
import type { Stats } from "@/lib/data";

const ITEMS: { key: keyof Stats; label: string; suffix?: string }[] = [
  { key: "votes_today", label: "Agent votes today" },
  { key: "alerts_this_week", label: "Clearings confirmed this week" },
  { key: "area_verified_ha", label: "Hectares of clearing verified", suffix: " ha" },
  { key: "active_agents_7d", label: "Active agents (7d)" },
];

function useCountUp(target: number) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min((t - start) / 900, 1);
      setV(a + (target - a) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Counter({ value, label, suffix }: { value: number; label: string; suffix?: string }) {
  const v = useCountUp(value);
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="num text-2xl font-semibold text-fg sm:text-3xl">
        {value < 100 && !Number.isInteger(value) ? v.toFixed(1) : Math.round(v).toLocaleString()}
        {suffix && <span className="text-base text-muted">{suffix}</span>}
      </div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

// Live network counters; polls /api/stats every 60s (BUILD_SPEC §7).
export function StatCounters({ initial }: { initial: Stats }) {
  const [stats, setStats] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/stats")
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && setStats(s))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {ITEMS.map((i) => (
        <Counter key={i.key} value={Number(stats[i.key]) || 0} label={i.label} suffix={i.suffix} />
      ))}
    </div>
  );
}
