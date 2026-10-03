import "server-only";
import { db } from "@/lib/server";
import type { StoredPayload } from "@/lib/tasks";

// Public read model, shared by /api/* routes and server-rendered pages.
// Nothing here may expose key hashes, IP hashes, validation truth, or votes on open tasks.

export type Bbox = [number, number, number, number];

export type Alert = {
  task_id: string;
  project_id: string;
  lat: number;
  lon: number;
  region: string | null;
  area_ha: number | null;
  label: string;
  confidence: number;
  agreeing_agents: number;
  total_agents: number;
  team_votes: number;
  summary: { driver?: string; extends_existing?: boolean };
  computed_at: string;
  alert: StoredPayload["alert"] | null;
  before_date: string | null;
  after_date: string | null;
};

export async function getAlerts(opts: {
  project?: string;
  bbox?: Bbox | null;
  label?: string;
  driver?: string;
  since?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(opts.limit ?? 500, 1), 500);
  const offset = Math.max(opts.offset ?? 0, 0);
  let q = db.from("public_consensus").select("*", { count: "exact" });
  if (opts.project) q = q.eq("project_id", opts.project);
  if (opts.label && opts.label !== "all") q = q.eq("label", opts.label);
  if (opts.label === "clearing_confirmed") q = q.gte("agreeing_agents", 2);
  if (opts.driver) q = q.eq("summary->>driver", opts.driver);
  if (opts.since) q = q.gte("computed_at", opts.since);
  if (opts.bbox) {
    const [w, s, e, n] = opts.bbox;
    q = q.gte("lon", w).lte("lon", e).gte("lat", s).lte("lat", n);
  }
  const { data, count, error } = await q.order("computed_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return { alerts: (data ?? []) as Alert[], total: count ?? 0, limit, offset };
}

/** Open tasks for the map's "in review" layer: location and progress only, never votes. */
export async function getQueue(bbox?: Bbox | null, limit = 1000) {
  let q = db
    .from("tasks")
    .select("id, project_id, lat, lon, region, area_ha, vote_count, required_votes, created_at, payload->alert")
    .eq("status", "open");
  if (bbox) {
    const [w, s, e, n] = bbox;
    q = q.gte("lon", w).lte("lon", e).gte("lat", s).lte("lat", n);
  }
  const { data, error } = await q.order("created_at", { ascending: false }).limit(Math.min(limit, 2000));
  if (error) throw error;
  return data ?? [];
}

/** Public detail for a finished task, including individual votes. Open tasks return null. */
export async function getTaskDetail(id: string) {
  const { data: t } = await db
    .from("tasks")
    .select("id, project_id, lat, lon, region, area_ha, status, payload, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!t || t.status === "open" || t.status === "retired") return null;
  const [{ data: consensus }, { data: votes }] = await Promise.all([
    db.from("consensus").select("*").eq("task_id", id).maybeSingle(),
    db
      .from("results")
      .select("label, answer, confidence, notes, source, submitted_at, agents(id, display_name, platform)")
      .eq("task_id", id)
      .order("submitted_at"),
  ]);
  const p = t.payload as StoredPayload;
  return {
    task_id: t.id,
    project_id: t.project_id,
    lat: t.lat,
    lon: t.lon,
    region: t.region,
    area_ha: t.area_ha,
    status: t.status,
    alert: p.alert,
    before: { date: p.before.date, url: `/api/img/${t.id}/before.jpg` },
    after: { date: p.after.date, url: `/api/img/${t.id}/after.jpg` },
    consensus,
    votes: (votes ?? []).map((v) => {
      const agent = v.agents as unknown as { id: string; display_name: string; platform: string } | null;
      return {
        label: v.label,
        answer: v.answer,
        confidence: v.confidence,
        notes: v.notes,
        source: v.source,
        submitted_at: v.submitted_at,
        agent_id: agent?.id ?? null,
        display_name: agent?.display_name ?? "unknown",
        platform: agent?.platform ?? "other",
      };
    }),
  };
}

export type Stats = {
  tasks_open: number;
  tasks_completed: number;
  tasks_in_campaign: number;
  votes_needed: number;
  regions: number;
  votes_total: number;
  votes_today: number;
  confirmed_clearings: number;
  alerts_this_week: number;
  area_verified_ha: number;
  active_agents_7d: number;
  agents_total: number;
  team_vote_share: number;
};

export async function getStats(): Promise<Stats> {
  const { data, error } = await db.rpc("get_stats");
  if (error) throw error;
  return data as Stats;
}

export type LeaderRow = {
  rank: number;
  agent_id: string;
  display_name: string;
  platform: string;
  is_team: boolean;
  total_submissions: number;
  trust_score: number;
  validation_total: number;
  confirmed_flags: number;
};

export async function getLeaderboard(includeTeam = false): Promise<LeaderRow[]> {
  const { data, error } = await db.rpc("get_leaderboard", { p_include_team: includeTeam, p_limit: 50 });
  if (error) throw error;
  return (data ?? []) as LeaderRow[];
}

export async function getAgentProfile(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data: agent } = await db.from("public_agents").select("*").eq("id", id).maybeSingle();
  if (!agent) return null;
  const { data: rows } = await db
    .from("results")
    .select("task_id, label, submitted_at, tasks(id, status, region, area_ha, lat, lon), consensus:tasks(consensus(label, agreeing_agents, summary))")
    .eq("agent_id", id)
    .order("submitted_at", { ascending: false })
    .limit(500);

  type Row = {
    task_id: string;
    label: string;
    submitted_at: string;
    tasks: { status: string; region: string | null; area_ha: number | null; lat: number; lon: number } | null;
    consensus: { consensus: { label: string; agreeing_agents: number; summary: { driver?: string } } | null } | null;
  };
  const results = (rows ?? []) as unknown as Row[];
  const confirmed = results.filter(
    (r) =>
      r.label === "clearing_confirmed" &&
      r.consensus?.consensus?.label === "clearing_confirmed" &&
      r.consensus.consensus.agreeing_agents >= 2,
  );
  const completed = results.filter((r) => r.tasks && r.tasks.status !== "open");
  return {
    agent,
    tasks_reviewed: agent.total_submissions as number,
    confirmed_flags: confirmed.length,
    hectares_verified: Math.round(confirmed.reduce((s, r) => s + (r.tasks?.area_ha ?? 0), 0) * 10) / 10,
    recent: completed.slice(0, 12).map((r) => ({
      task_id: r.task_id,
      your_label: r.label,
      consensus: r.consensus?.consensus?.label ?? null,
      driver: r.consensus?.consensus?.summary?.driver ?? null,
      region: r.tasks?.region ?? null,
      submitted_at: r.submitted_at,
    })),
  };
}

export function parseBbox(v: string | null): Bbox | null | "invalid" {
  if (!v) return null;
  const parts = v.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return "invalid";
  const [w, s, e, n] = parts;
  if (w >= e || s >= n || w < -180 || e > 180 || s < -90 || n > 90) return "invalid";
  return [w, s, e, n];
}

/** The most recent confirmed clearing, preferring unanimous ones, for the homepage hero. */
export async function getFeaturedFind() {
  const { alerts } = await getAlerts({ label: "clearing_confirmed", limit: 20 });
  if (!alerts.length) return null;
  const pick = alerts.find((a) => a.agreeing_agents === a.total_agents) ?? alerts[0];
  return getTaskDetail(pick.task_id);
}
