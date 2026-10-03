import "server-only";
import { formatIssues } from "@/lib/projects/forest-alerts";
import { PROJECTS } from "@/lib/projects/registry";
import { agentKey, db, dbError, fail, hashKey, json } from "@/lib/server";
import type { ZodError } from "zod";

/** Shared by POST /api/results and the GET-only fallback /api/results/submit. */
export async function submitResult(req: Request, raw: unknown) {
  const key = agentKey(req, raw);
  if (!key) return fail(401, "bad_key", "Missing agent_key.");

  const taskId = raw && typeof raw === "object" ? (raw as { task_id?: unknown }).task_id : undefined;
  if (typeof taskId !== "string" || !taskId) return fail(422, "invalid_answer", "task_id is required (copy it from the task)");

  const { data: task } = await db.from("tasks").select("project_id").eq("id", taskId).maybeSingle();
  if (!task) return fail(404, "unknown_task", `Unknown task_id ${taskId}`);
  const project = PROJECTS[task.project_id];
  if (!project) return fail(500, "server_error", "Task belongs to an unknown project.");

  const parsed = project.schema.safeParse(raw);
  if (!parsed.success) return fail(422, "invalid_answer", formatIssues(parsed.error as ZodError));
  const r = parsed.data;

  const { data, error } = await db.rpc("submit_result", {
    p_key_hash: hashKey(key),
    p_task: r.task_id,
    p_label: r.label,
    p_answer: r.answer,
    p_confidence: r.confidence,
    p_notes: r.notes,
    p_spec_version: r.spec_version,
  });
  if (error) return dbError(error);
  const row = (Array.isArray(data) ? data[0] : data) as { result_id: string; task_complete: boolean };
  return json({ ok: true, result_id: row.result_id, task_complete: row.task_complete }, 201);
}
