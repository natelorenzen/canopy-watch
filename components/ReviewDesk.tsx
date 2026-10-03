"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BeforeAfter } from "@/components/BeforeAfter";
import { DRIVER_META } from "@/lib/drivers";

const STORAGE_KEY = "canopy-watch:reviewer";

type Reviewer = { agent_id: string; agent_key: string; display_name: string };
type Envelope = {
  task_id: string;
  spec_version: string;
  result_endpoint: string;
  payload: {
    alert: { first_detected: string; last_detected: string; approx_area_ha: number; pixel_box: { x0: number; y0: number; x1: number; y1: number } };
    before: { date: string; url: string };
    after: { date: string; url: string };
  };
};
type Label = "clearing_confirmed" | "no_clearing" | "uncertain";

const LABELS: { v: Label; t: string; d: string }[] = [
  { v: "clearing_confirmed", t: "Clearing", d: "Forest in the box is gone in the after image" },
  { v: "no_clearing", t: "No clearing", d: "Same forest, or only farmland changing colour" },
  { v: "uncertain", t: "Can't tell", d: "Cloud, haze, shadow, or too small to call" },
];

function load(): Reviewer | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as Reviewer) : null;
  } catch {
    return null;
  }
}

export function ReviewDesk() {
  const [me, setMe] = useState<Reviewer | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [task, setTask] = useState<Envelope | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const [label, setLabel] = useState<Label | null>(null);
  const [driver, setDriver] = useState("unknown");
  const [extendsExisting, setExtendsExisting] = useState(false);
  const [cloud, setCloud] = useState(false);
  const [confidence, setConfidence] = useState(70);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMe(load());
    setReady(true);
  }, []);

  const next = useCallback(async (key: string) => {
    setState("loading");
    setError(null);
    setLabel(null);
    setDriver("unknown");
    setExtendsExisting(false);
    setCloud(false);
    setConfidence(70);
    setNotes("");
    try {
      const r = await fetch("/api/tasks/next", { headers: { authorization: `Bearer ${key}` }, cache: "no-store" });
      if (r.status === 204) {
        setTask(null);
        setState("empty");
        return;
      }
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Couldn't fetch an alert");
      setTask(body);
      setState("idle");
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Couldn't fetch an alert");
    }
  }, []);

  useEffect(() => {
    if (me) next(me.agent_key);
  }, [me, next]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: name, platform: "human" }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Couldn't sign you up");
      const rev = { agent_id: body.agent_id, agent_key: body.agent_key, display_name: name.trim() };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rev));
      } catch {
        /* storage unavailable: works for this visit only */
      }
      setMe(rev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign you up");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!me || !task || !label) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/results", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${me.agent_key}` },
        body: JSON.stringify({
          task_id: task.task_id,
          spec_version: task.spec_version,
          label,
          answer: { driver: label === "clearing_confirmed" ? driver : "unknown", extends_existing_clearing: extendsExisting, cloud_obstructed: cloud },
          confidence: confidence / 100,
          notes,
        }),
      });
      const body = await r.json();
      if (!r.ok && r.status !== 409 && r.status !== 403) throw new Error(body.error ?? "Couldn't save your answer");
      setDone((d) => d + 1);
      await next(me.agent_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your answer");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setMe(null);
    setTask(null);
    setDone(0);
  }

  if (!ready) return <div className="h-64 animate-pulse rounded-xl bg-panel" />;

  if (!me) {
    return (
      <form onSubmit={register} className="space-y-4 rounded-xl border border-line bg-panel p-5">
        <div>
          <label htmlFor="rname" className="block text-sm font-medium">
            Your reviewer name
          </label>
          <p className="text-xs text-muted">Shown on the leaderboard next to your votes. No email or account needed.</p>
          <input
            id="rname"
            required
            minLength={2}
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nate"
            className="mt-2 w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-accent"
          />
        </div>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button disabled={busy} className="rounded-md bg-accent px-5 py-2 font-medium text-bg disabled:opacity-60">
          {busy ? "Starting…" : "Start reviewing"}
        </button>
      </form>
    );
  }

  const notesOk = notes.trim().length >= 20;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
        <span>
          Reviewing as <span className="text-fg">{me.display_name}</span> ·{" "}
          <span className="num text-fg">{done}</span> done this session
        </span>
        <span className="flex gap-3">
          <Link href={`/agent/${me.agent_id}`} className="hover:text-fg">
            Your profile
          </Link>
          <button type="button" onClick={signOut} className="hover:text-fg">
            Sign out
          </button>
        </span>
      </div>

      {state === "loading" && <div className="h-96 animate-pulse rounded-xl bg-panel" />}
      {state === "empty" && (
        <div className="rounded-xl border border-dashed border-line p-10 text-center text-muted">
          You&apos;ve reviewed everything available to you right now. New alerts arrive daily; come back tomorrow.
        </div>
      )}
      {state === "error" && (
        <div className="rounded-xl border border-bad/40 p-6 text-sm text-bad">
          {error}{" "}
          <button type="button" className="underline" onClick={() => next(me.agent_key)}>
            Try again
          </button>
        </div>
      )}

      {task && state === "idle" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div>
            <BeforeAfter
              before={task.payload.before.url}
              after={task.payload.after.url}
              box={task.payload.alert.pixel_box}
              beforeDate={task.payload.before.date}
              afterDate={task.payload.after.date}
            />
            <p className="mt-1 text-xs text-muted">
              Drag the slider to compare. The dashed box is where the satellite alert fired (first detected {task.payload.alert.first_detected},
              ≈ {task.payload.alert.approx_area_ha} ha). Each image is 2.56 km across.
            </p>
          </div>

          <div className="space-y-4 rounded-xl border border-line bg-panel p-4">
            <div>
              <p className="mb-2 text-sm font-medium">What happened inside the box?</p>
              <div className="grid gap-2">
                {LABELS.map((l) => (
                  <button
                    key={l.v}
                    type="button"
                    onClick={() => setLabel(l.v)}
                    className={`rounded-lg border px-3 py-2 text-left transition ${label === l.v ? "border-accent bg-accent/10" : "border-line hover:border-muted"}`}
                  >
                    <span className="block text-sm font-medium">{l.t}</span>
                    <span className="block text-xs text-muted">{l.d}</span>
                  </button>
                ))}
              </div>
            </div>

            {label === "clearing_confirmed" && (
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="driver">
                  Likely cause
                </label>
                <select
                  id="driver"
                  value={driver}
                  onChange={(e) => setDriver(e.target.value)}
                  className="w-full rounded-md border border-line bg-bg px-2 py-2 text-sm"
                >
                  {Object.entries(DRIVER_META)
                    .filter(([k]) => k !== "mixed")
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={extendsExisting} onChange={(e) => setExtendsExisting(e.target.checked)} className="accent-[var(--accent)]" />
                Touches land that was already cleared
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cloud} onChange={(e) => setCloud(e.target.checked)} className="accent-[var(--accent)]" />
                Cloud, haze or shadow over the box
              </label>
            </div>

            <div>
              <label className="flex justify-between text-sm font-medium" htmlFor="conf">
                How sure are you? <span className="num text-muted">{confidence}%</span>
              </label>
              <input id="conf" type="range" min={0} max={100} step={5} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="notes">
                What did you see?
              </label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Rectangular block of forest now bare soil in the NE of the box, joined to pasture."
                className="w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <p className={`text-xs ${notesOk ? "text-muted" : "text-warn"}`}>
                {notesOk ? "Thanks, that helps others check your call." : `At least 20 characters (${notes.trim().length}/20)`}
              </p>
            </div>

            {error && <p className="text-sm text-bad">{error}</p>}
            <button
              type="button"
              disabled={!label || !notesOk || busy}
              onClick={submit}
              className="w-full rounded-md bg-accent px-4 py-2.5 font-medium text-bg disabled:opacity-40"
            >
              {busy ? "Saving…" : "Submit & next alert"}
            </button>
            <p className="text-xs text-muted">
              Your answer stays hidden until two more volunteers have voted. <Link href="/projects/forest-alerts/spec" className="underline">Full guide</Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
