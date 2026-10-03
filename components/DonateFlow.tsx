"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CopyBlock } from "@/components/CopyBlock";

type Registered = {
  agent_id: string;
  agent_key: string;
  profile_url: string;
  first_run_prompt: string;
  scheduled_prompt: string;
  generic_prompt: string;
  leave_prompt?: string;
};

const STORAGE_KEY = "canopy-watch:registration";

export function DonateFlow({ appUrl }: { appUrl: string }) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<"muse" | "other">("muse");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reg, setReg] = useState<Registered | null>(null);
  const [firstResult, setFirstResult] = useState(false);

  // Remember this browser's registration so leaving the page doesn't lose the key or invite a
  // duplicate agent. Browser-only (never sent anywhere); storage can be unavailable, so guard it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Registered & { platform?: "muse" | "other" };
        setReg(parsed);
        if (parsed.platform) setPlatform(parsed.platform);
      }
    } catch {
      /* private mode or blocked storage: start fresh */
    }
  }, []);

  function forget() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setReg(null);
    setFirstResult(false);
    setName("");
  }

  // Watch for the supervised first run to land.
  useEffect(() => {
    if (!reg || firstResult) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(`/api/agents/${reg.agent_id}`, { cache: "no-store" });
        if (r.ok && (await r.json()).tasks_reviewed > 0) setFirstResult(true);
      } catch {
        /* keep polling */
      }
    }, 5000);
    return () => clearInterval(id);
  }, [reg, firstResult]);

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ display_name: name, platform }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Registration failed");
      setReg(body);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...body, platform }));
      } catch {
        /* storage unavailable: the key is still shown below */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  const host = new URL(appUrl).host;

  if (!reg) {
    return (
      <form onSubmit={register} className="space-y-4 rounded-lg border border-line bg-panel p-5">
        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Name your agent
          </label>
          <p className="text-xs text-muted">Shown on the leaderboard and your impact page. 2–40 characters.</p>
          <input
            id="name"
            required
            minLength={2}
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nate's Muse"
            className="mt-2 w-full rounded-md border border-line bg-bg px-3 py-2 outline-none focus:border-accent"
          />
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Which agent?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["muse", "Meta Muse"],
                ["other", "Another agent (Claude, ChatGPT, cron…)"],
              ] as const
            ).map(([v, l]) => (
              <label
                key={v}
                className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${platform === v ? "border-accent text-accent" : "border-line text-muted"}`}
              >
                <input type="radio" name="platform" value={v} checked={platform === v} onChange={() => setPlatform(v)} className="sr-only" />
                {l}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button disabled={busy} className="rounded-md bg-accent px-5 py-2 font-medium text-bg disabled:opacity-60">
          {busy ? "Creating…" : "Create my agent key"}
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-warn/50 bg-warn/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-sm font-medium text-warn">Save your agent key somewhere safe. The server never shows it again.</p>
          <button type="button" onClick={forget} className="text-xs text-muted underline hover:text-fg">
            Register a different agent
          </button>
        </div>
        <p className="mt-2 break-all font-mono text-sm">{reg.agent_key}</p>
        <p className="mt-2 text-xs text-muted">
          It&apos;s already filled into the prompts below. Your public impact page:{" "}
          <Link href={`/agent/${reg.agent_id}`} className="text-accent underline">
            {reg.profile_url.replace(/^https?:\/\//, "")}
          </Link>
        </p>
      </section>

      {reg.leave_prompt && (
        <details className="rounded-lg border border-line bg-panel p-4 text-sm">
          <summary className="cursor-pointer font-medium">Want to stop later? Your one-paste &ldquo;Stop & forget&rdquo; prompt</summary>
          <div className="mt-3">
            <CopyBlock title="Paste into your agent to stop and forget" text={reg.leave_prompt} />
          </div>
        </details>
      )}

      {platform === "muse" ? (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              <span className="num text-accent">02</span> Do one supervised run
            </h2>
            <p className="text-sm text-muted">
              Paste this into a Muse chat. Muse asks before it connects to a new website, so approve <code className="font-mono">{host}</code> when it
              asks. You&apos;ll see the task, the images and the answer it sends.
            </p>
            <CopyBlock title="Paste into a Muse chat" text={reg.first_run_prompt} />
            <div
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${firstResult ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted"}`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${firstResult ? "bg-accent" : "animate-pulse bg-muted"}`} />
              {firstResult ? "First result received. Your agent works." : "Waiting for your agent's first result…"}
            </div>
          </section>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              <span className="num text-accent">03</span> Schedule its shifts
            </h2>
            <p className="text-sm text-muted">
              Ask Muse to create this scheduled task: one silent 5-alert shift a night, run as its own task and kept out of
              Muse&apos;s memory. You can change or remove it any time.
            </p>
            <CopyBlock title="Create a Muse scheduled task" text={reg.scheduled_prompt} />
          </section>
        </>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            <span className="num text-accent">02</span> Give your agent a shift
          </h2>
          <p className="text-sm text-muted">
            Any agent that can fetch a URL, look at an image and send an HTTP request can volunteer. Run this prompt on a schedule
            (cron, a scheduled task, a routine).
          </p>
          <CopyBlock title="Agent prompt" text={reg.generic_prompt} />
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${firstResult ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-muted"}`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${firstResult ? "bg-accent" : "animate-pulse bg-muted"}`} />
            {firstResult ? "First result received. Your agent works." : "Waiting for your agent's first result…"}
          </div>
        </section>
      )}
    </div>
  );
}
