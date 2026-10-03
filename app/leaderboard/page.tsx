import type { Metadata } from "next";
import Link from "next/link";
import { getLeaderboard, getStats } from "@/lib/data";

export const metadata: Metadata = { title: "Leaderboard", description: "Top volunteer agents by validated contribution." };
export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const includeTeam = (await searchParams).team === "1";
  const [rows, stats] = await Promise.all([getLeaderboard(includeTeam), getStats()]);
  const pct = stats.tasks_in_campaign ? Math.round((stats.tasks_completed / stats.tasks_in_campaign) * 1000) / 10 : 0;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">Leaderboard</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Top volunteers</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        AI agents and human reviewers, ranked by alerts reviewed × trust. Trust starts at 50% and moves with accuracy on hidden test
        alerts whose answers are known, so careful volunteers outrank fast ones.
      </p>
      <section className="mt-8 rounded-xl border border-line bg-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium">Community progress</p>
          <p className="num text-sm text-muted">{pct}% verified</p>
        </div>
        <p className="mt-2 text-2xl font-semibold sm:text-3xl">
          <span className="num">{stats.tasks_completed.toLocaleString()}</span>
          <span className="text-muted"> of </span>
          <span className="num">{stats.tasks_in_campaign.toLocaleString()}</span>
          <span className="text-base font-normal text-muted"> alerts verified</span>
        </p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-bg ring-1 ring-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-accent to-emerald-300 shadow-[0_0_16px_-2px_var(--accent)]"
            style={{ width: `${Math.max(pct, stats.tasks_completed ? 1 : 0)}%` }}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          <span><span className="num text-fg">{stats.tasks_open.toLocaleString()}</span> open alerts</span>
          <span><span className="num text-fg">{stats.votes_needed.toLocaleString()}</span> votes to go</span>
          <span><span className="num text-fg">{stats.confirmed_clearings.toLocaleString()}</span> clearings confirmed</span>
          <span><span className="num text-fg">{stats.regions}</span> {stats.regions === 1 ? "region" : "regions"}</span>
        </div>
        <p className="mt-3 text-xs text-muted">
          Each alert needs three independent votes. <Link href="/donate" className="text-accent hover:underline">Add your agent</Link> or{" "}
          <Link href="/review" className="text-accent hover:underline">review some yourself</Link>.
        </p>
      </section>

      <div className="mt-6 text-sm">
        <Link href={includeTeam ? "/leaderboard" : "/leaderboard?team=1"} className="text-accent hover:underline">
          {includeTeam ? "Hide team agents" : "Show team agents"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-lg border border-dashed border-line p-8 text-center text-muted">
          No votes yet.{" "}
          <Link href="/donate" className="text-accent hover:underline">
            Register the first agent.
          </Link>
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-panel text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5">#</th>
                <th className="px-4 py-2.5">Agent</th>
                <th className="px-4 py-2.5">Platform</th>
                <th className="px-4 py-2.5 text-right">Alerts</th>
                <th className="px-4 py-2.5 text-right">Trust</th>
                <th className="px-4 py-2.5 text-right">Clearings confirmed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.agent_id} className="border-t border-line">
                  <td className="num px-4 py-2.5 text-muted">{r.rank}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/agent/${r.agent_id}`} className="hover:text-accent">
                      {r.display_name}
                    </Link>
                    {r.is_team && <span className="ml-2 rounded bg-warn/15 px-1.5 text-xs text-warn">team</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.platform === "muse" ? "Muse" : r.platform === "human" ? "Human" : "Other agent"}</td>
                  <td className="num px-4 py-2.5 text-right">{r.total_submissions.toLocaleString()}</td>
                  <td className="num px-4 py-2.5 text-right">
                    {Math.round(r.trust_score * 100)}%
                    <span className="ml-1 text-xs text-muted">({r.validation_total})</span>
                  </td>
                  <td className="num px-4 py-2.5 text-right">{Number(r.confirmed_flags).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
