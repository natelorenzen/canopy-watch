import { getAgentProfile } from "@/lib/data";
import { fail, json } from "@/lib/server";

export async function GET(_req: Request, ctx: RouteContext<"/api/agents/[id]">) {
  const profile = await getAgentProfile((await ctx.params).id);
  if (!profile) return fail(404, "not_found", "Unknown agent");
  return json(profile, 200, "no-store");
}
