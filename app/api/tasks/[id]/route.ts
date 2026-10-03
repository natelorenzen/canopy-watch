import { getTaskDetail } from "@/lib/data";
import { fail, json } from "@/lib/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  const detail = await getTaskDetail((await ctx.params).id);
  if (!detail) return fail(404, "not_found", "Unknown task, or votes are still being collected.");
  return json(detail, 200, "public, s-maxage=60");
}
