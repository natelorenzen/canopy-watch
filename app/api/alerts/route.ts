import { z } from "zod";
import { getAlerts, parseBbox } from "@/lib/data";
import { fail, json } from "@/lib/server";

const query = z.object({
  project: z.string().default("forest-alerts"),
  label: z.enum(["clearing_confirmed", "no_clearing", "uncertain", "all"]).default("clearing_confirmed"),
  driver: z.string().max(40).optional(),
  since: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const bbox = parseBbox(sp.get("bbox"));
  if (bbox === "invalid") return fail(422, "invalid_bbox", "bbox must be minLon,minLat,maxLon,maxLat");
  const parsed = query.safeParse(Object.fromEntries([...sp.entries()].filter(([k]) => k !== "bbox")));
  if (!parsed.success) return fail(422, "invalid_query", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const result = await getAlerts({ ...parsed.data, bbox });
  return json(result, 200, "public, s-maxage=60, stale-while-revalidate=300");
}
