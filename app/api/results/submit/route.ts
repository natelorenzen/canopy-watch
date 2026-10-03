import { submitResult } from "@/lib/submit";

export const dynamic = "force-dynamic";

// GET-only fallback for agents that can fetch pages but can't POST (the Musecade pattern). Same
// validation as POST; answer fields are flattened into the query string.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const bool = (v: string | null) => (v === "true" ? true : v === "false" ? false : v);
  const num = (v: string | null) => (v !== null && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v);
  return submitResult(req, {
    agent_key: q.get("agent_key") ?? undefined,
    task_id: q.get("task_id"),
    spec_version: q.get("spec_version"),
    label: q.get("label"),
    answer: {
      driver: q.get("driver"),
      extends_existing_clearing: bool(q.get("extends_existing_clearing")),
      cloud_obstructed: bool(q.get("cloud_obstructed")),
    },
    confidence: num(q.get("confidence")),
    notes: q.get("notes"),
  });
}
