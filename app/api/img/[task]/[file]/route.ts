import { db, fail } from "@/lib/server";
import { upstreamImageUrl, type StoredPayload } from "@/lib/tasks";

// Image proxy: agents only ever contact our host. Each crop is an immutable (scene, bbox) pair, so
// the CDN caches it for a year and Planetary Computer sees ~one request per image.
export async function GET(_req: Request, ctx: RouteContext<"/api/img/[task]/[file]">) {
  const { task, file } = await ctx.params;
  const which = file === "before.jpg" ? "before" : file === "after.jpg" ? "after" : null;
  if (!which) return fail(404, "not_found", "Use before.jpg or after.jpg");

  const { data } = await db.from("tasks").select("payload").eq("id", task).maybeSingle();
  if (!data) return fail(404, "unknown_task", "Unknown task");

  const upstream = await fetch(upstreamImageUrl(data.payload as StoredPayload, which));
  if (!upstream.ok) {
    return Response.json(
      { error: "Imagery provider unavailable. Answer uncertain with confidence 0 and say so in notes.", code: "upstream" },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
  return new Response(upstream.body, {
    headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=86400, s-maxage=31536000, immutable" },
  });
}
