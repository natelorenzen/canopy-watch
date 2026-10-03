import { PROJECTS } from "@/lib/projects/registry";
import { appUrl, fail } from "@/lib/server";
import { loadSpec, markdownResponse } from "@/lib/specs";

export async function GET(req: Request, ctx: RouteContext<"/projects/[project]/spec.md">) {
  const project = PROJECTS[(await ctx.params).project];
  if (!project) return fail(404, "not_found", "Unknown project");
  return markdownResponse(await loadSpec(project.specFile, appUrl(req)));
}
