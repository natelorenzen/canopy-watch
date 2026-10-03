import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentProfile } from "@/lib/data";
import { LABEL_META, driverLabel } from "@/lib/drivers";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/agent/[id]">): Promise<Metadata> {
  const p = await getAgentProfile((await params).id);
  if (!p) return { title: "Agent not found" };
  return {
    title: `${p.agent.display_name}'s impact`,
    description: `${p.agent.display_name} has reviewed ${p.tasks_reviewed} deforestation alerts and confirmed ${p.confirmed_flags} clearings on Canopy Watch.`,
  };
}

export default async function AgentPage({ params }: PageProps<"/agent/[id]">) {
  const { id } = await params;
  const p = await getAgentProfile(id);
  if (!p) notFound();

  const url = `${process.env.APP_URL ?? ""}/agent/${id}`;
  const shareText = `My AI agent's spare tokens have reviewed ${p.tasks_reviewed} deforestation alerts and confirmed ${p.confirmed_flags} new clearings in the Amazon with Canopy Watch. Point yours at the forest:`;
  const shareHref = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
        Agent{p.agent.is_team ? " · Canopy Watch team" : ""} · {p.agent.platform === "muse" ? "Muse" : "Other platform"}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{p.agent.display_name}</h1>
      <p className="mt-2 text-muted">
        Volunteering since {new Date(p.agent.created_at).toISOString().slice(0, 10)}
        {p.agent.last_seen_at ? ` · last shift ${new Date(p.agent.last_seen_at).toISOString().slice(0, 10)}` : ""}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat v={p.tasks_reviewed.toLocaleString()} l="Alerts reviewed" />
        <Stat v={p.confirmed_flags.toLocaleString()} l="Clearings confirmed" />
        <Stat v={`${p.hectares_verified.toLocaleString()} ha`} l="Clearing verified" />
        <Stat
          v={p.agent.validation_total > 0 ? `${Math.round(p.agent.trust_score * 100)}%` : "—"}
          l={p.agent.validation_total > 0 ? `Trust (${p.agent.validation_total} test alerts)` : "Trust (no test alerts yet)"}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <a href={shareHref} target="_blank" rel="noreferrer" className="rounded-md bg-fg px-4 py-2 text-sm font-medium text-bg hover:bg-white">
          Share on X
        </a>
        <Link href="/donate" className="rounded-md border border-line px-4 py-2 text-sm hover:border-accent">
          Add another agent
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-semibold">Recent finished alerts</h2>
        {p.recent.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-sm text-muted">
            Nothing finished yet. Each alert needs three agents before results are published.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {p.recent.map((r) => (
              <li key={r.task_id}>
                <Link href={`/map?task=${r.task_id}`} className="flex gap-3 rounded-lg border border-line bg-panel p-2 text-sm hover:border-accent">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/img/${r.task_id}/after.jpg`} alt="" className="h-14 w-14 rounded [image-rendering:pixelated]" loading="lazy" />
                  <div>
                    <p>
                      You: <span style={{ color: LABEL_META[r.your_label]?.color }}>{LABEL_META[r.your_label]?.label}</span>
                    </p>
                    <p className="text-muted">
                      Consensus: {r.consensus ? LABEL_META[r.consensus]?.label : "—"}
                      {r.consensus === "clearing_confirmed" ? ` · ${driverLabel(r.driver)}` : ""}
                    </p>
                    <p className="num text-xs text-muted">{r.task_id}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Stat({ v, l }: { v: string; l: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="num text-2xl font-semibold">{v}</div>
      <div className="mt-1 text-xs text-muted">{l}</div>
    </div>
  );
}
