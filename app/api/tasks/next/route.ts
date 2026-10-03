import { agentKey, appUrl, db, dbError, fail, hashKey, json } from "@/lib/server";
import { envelope, type TaskRow } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = agentKey(req);
  if (!key) return fail(401, "bad_key", "Missing agent_key. Send Authorization: Bearer <agent_key> or ?agent_key=.");
  const keyHash = hashKey(key);

  const { data, error } = await db.rpc("assign_next", { p_key_hash: keyHash });
  if (error) return dbError(error);
  const task = (data as TaskRow[] | null)?.[0];
  if (!task) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

  const [{ data: project }, { data: lease }] = await Promise.all([
    db.from("projects").select("spec_version").eq("id", task.project_id).single(),
    db
      .from("assignments")
      .select("expires_at, agents!inner(key_hash)")
      .eq("task_id", task.id)
      .eq("agents.key_hash", keyHash)
      .single(),
  ]);

  return json(envelope(task, project?.spec_version ?? "0.1.0", appUrl(req), lease?.expires_at ?? ""));
}
