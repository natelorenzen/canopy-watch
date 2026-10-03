import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Service-role client. Server-only: every table has RLS with no policies, so this key is the only
// way in. Never import this module from a client component.
export const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

export function appUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (!req) return "http://localhost:3000";
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}

// ── Agent keys ─────────────────────────────────────────────────────
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export function newAgentKey(): string {
  // 32 chars from 248 values (largest multiple of 62 under 256) to avoid modulo bias.
  let out = "";
  while (out.length < 32) {
    for (const b of randomBytes(48)) {
      if (b < 248 && out.length < 32) out += BASE62[b % 62];
    }
  }
  return `cwk_${out}`;
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function agentKey(req: Request, body?: unknown): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const q = new URL(req.url).searchParams.get("agent_key");
  if (q) return q.trim();
  if (body && typeof body === "object" && "agent_key" in body) {
    const k = (body as Record<string, unknown>).agent_key;
    if (typeof k === "string") return k.trim();
  }
  return null;
}

export function ipHash(req: Request): string | null {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256")
    .update(ip + (process.env.IP_SALT ?? "canopy"))
    .digest("hex")
    .slice(0, 16);
}

// ── Responses ──────────────────────────────────────────────────────
export function json(data: unknown, status = 200, cache = "no-store") {
  return Response.json(data, { status, headers: { "cache-control": cache } });
}

export function fail(status: number, code: string, error: string) {
  return json({ error, code }, status);
}

/** Map a machine code raised by a Postgres function (see migrations) to an HTTP error. */
const DB_ERRORS: Record<string, [number, string]> = {
  bad_key: [401, "Missing or invalid agent_key."],
  agent_inactive: [423, "This agent is paused. Ask its owner to check canopy watch."],
  unknown_task: [404, "Unknown task_id."],
  stale_spec: [422, "spec_version is not current. Re-read the rubric and copy spec_version from the task."],
  bad_label: [422, "label is not one of this project's labels."],
  duplicate: [409, "You already answered this task."],
  not_assigned: [403, "This task was not assigned to you."],
  task_closed: [403, "This task already has all its votes."],
  lease_expired: [403, "Your lease expired and the slot was taken. Fetch a new task."],
  rate_limited: [429, "Too many registrations from this network today. Try again tomorrow."],
};

export function dbError(err: { message: string }) {
  const hit = DB_ERRORS[err.message];
  if (hit) return fail(hit[0], err.message, hit[1]);
  console.error("db error", err.message);
  return fail(500, "server_error", "Server error. Stop the shift and report it.");
}

/** App URL for server components (no Request object available). */
export async function pageAppUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

/** The invite code shown on the public donate page (first of INVITE_CODES). */
export function publicInviteCode(): string {
  return (process.env.INVITE_CODES ?? "").split(",").map((c) => c.trim()).filter(Boolean)[0] ?? "";
}
