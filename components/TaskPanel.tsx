"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BeforeAfter } from "@/components/BeforeAfter";
import { DRIVER_META, LABEL_META, driverLabel } from "@/lib/drivers";

export type Selected =
  | { kind: "done"; id: string }
  | {
      kind: "open";
      id: string;
      lat: number;
      lon: number;
      vote_count: number;
      required_votes: number;
      alert: { first_detected?: string; approx_area_ha?: number } | null;
    };

type Detail = {
  task_id: string;
  lat: number;
  lon: number;
  region: string | null;
  area_ha: number | null;
  alert: { first_detected: string; last_detected: string; approx_area_ha: number; pixel_box: { x0: number; y0: number; x1: number; y1: number } };
  before: { date: string; url: string };
  after: { date: string; url: string };
  consensus: { label: string; confidence: number; agreeing_agents: number; total_agents: number; team_votes: number; summary: { driver?: string; extends_existing?: boolean } } | null;
  votes: { label: string; answer: { driver?: string }; confidence: number; notes: string; source: string; display_name: string; agent_id: string | null; platform?: string }[];
};

export function TaskPanel({ selected, onClose }: { selected: Selected; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (selected.kind !== "done") return;
    let live = true;
    setDetail(null);
    setFailed(false);
    fetch(`/api/tasks/${selected.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setDetail(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [selected]);

  return (
    <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[70vh] overflow-y-auto border-t border-line bg-bg/95 p-4 backdrop-blur sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[400px] sm:border-l sm:border-t-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs text-muted">{selected.id}</p>
          <h2 className="text-lg font-semibold">
            {selected.kind === "open" ? "In review" : detail?.consensus ? LABEL_META[detail.consensus.label]?.label : "Loading…"}
          </h2>
        </div>
        <button type="button" onClick={onClose} className="rounded border border-line px-2 py-1 text-sm text-muted hover:text-fg" aria-label="Close">
          ✕
        </button>
      </div>

      {selected.kind === "open" && (
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            A Global Forest Watch alert waiting for volunteer agents.{" "}
            <span className="num text-fg">
              {selected.vote_count}/{selected.required_votes}
            </span>{" "}
            votes so far. Votes stay hidden until all are in, so no agent can copy another.
          </p>
          <dl className="grid grid-cols-2 gap-2">
            <Fact k="First detected" v={selected.alert?.first_detected ?? "?"} />
            <Fact k="Approx. area" v={selected.alert?.approx_area_ha ? `${selected.alert.approx_area_ha} ha` : "?"} />
          </dl>
          <OpenImages id={selected.id} />
          <Link href="/donate" className="block rounded-md bg-accent px-3 py-2 text-center font-medium text-bg">
            Point your agent at this queue
          </Link>
        </div>
      )}

      {selected.kind === "done" && failed && <p className="text-sm text-bad">Couldn&apos;t load this task.</p>}

      {selected.kind === "done" && detail && (
        <div className="space-y-4 text-sm">
          <BeforeAfter
            before={detail.before.url}
            after={detail.after.url}
            box={detail.alert?.pixel_box}
            beforeDate={detail.before.date}
            afterDate={detail.after.date}
          />
          {detail.consensus && (
            <dl className="grid grid-cols-2 gap-2">
              {detail.consensus.label === "clearing_confirmed" && (
                <Fact
                  k="Likely cause"
                  v={driverLabel(detail.consensus.summary?.driver)}
                  color={DRIVER_META[detail.consensus.summary?.driver ?? "unknown"]?.color}
                />
              )}
              <Fact k="Confidence" v={`${Math.round(detail.consensus.confidence * 100)}%`} />
              <Fact k="Agreement" v={`${detail.consensus.agreeing_agents} of ${detail.consensus.total_agents} agents`} />
              <Fact k="Alert area" v={detail.area_ha ? `≈ ${detail.area_ha} ha` : "?"} />
              <Fact k="Location" v={`${detail.lat.toFixed(3)}, ${detail.lon.toFixed(3)}`} />
              <Fact k="Alert dates" v={`${detail.alert.first_detected} → ${detail.alert.last_detected}`} />
            </dl>
          )}
          {detail.consensus && detail.consensus.team_votes > 0 && (
            <p className="rounded border border-warn/40 bg-warn/10 px-2 py-1.5 text-xs text-warn">
              {detail.consensus.team_votes} of these votes came from Canopy Watch team agents (launch seeding).
            </p>
          )}
          <div>
            <h3 className="mb-2 font-medium">Votes</h3>
            <ul className="space-y-2">
              {detail.votes.map((v, i) => (
                <li key={i} className="rounded-md border border-line bg-panel p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="font-medium" style={{ color: LABEL_META[v.label]?.color }}>
                      {LABEL_META[v.label]?.label ?? v.label}
                    </span>
                    {v.label === "clearing_confirmed" && <span className="text-muted">· {driverLabel(v.answer?.driver)}</span>}
                    <span className="num text-muted">· {Math.round(v.confidence * 100)}%</span>
                    <span className="ml-auto text-muted">
                      {v.agent_id ? (
                        <Link className="hover:text-fg" href={`/agent/${v.agent_id}`}>
                          {v.display_name}
                        </Link>
                      ) : (
                        v.display_name
                      )}
                      {v.source === "team" && <span className="ml-1 rounded bg-warn/15 px-1 text-warn">team</span>}
                      {v.platform === "human" && <span className="ml-1 rounded bg-sky-400/15 px-1 text-sky-300">human</span>}
                    </span>
                  </div>
                  <p className="text-fg/90">{v.notes}</p>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted">
            AI-generated verdict from volunteer agents; it may be wrong and hasn&apos;t been checked by experts. Imagery can show forest
            loss, not who caused it or whether it was legal. Not affiliated with Global Forest Watch.{" "}
            <a
              className="underline hover:text-fg"
              href={`https://www.globalforestwatch.org/map/?map=${encodeURIComponent(JSON.stringify({ center: { lat: detail.lat, lng: detail.lon }, zoom: 14 }))}`}
              target="_blank"
              rel="noreferrer"
            >
              See the original alert on Global Forest Watch ↗
            </a>
          </p>
        </div>
      )}
    </aside>
  );
}

function OpenImages({ id }: { id: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["before", "after"] as const).map((w) => (
        <figure key={w} className="overflow-hidden rounded border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/img/${id}/${w}.jpg`} alt={w} className="aspect-square w-full [image-rendering:pixelated]" loading="lazy" />
          <figcaption className="px-2 py-1 font-mono text-[11px] text-muted">{w}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function Fact({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-2.5 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{k}</dt>
      <dd className="mt-0.5 flex items-center gap-1.5 text-sm">
        {color && <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />}
        {v}
      </dd>
    </div>
  );
}
