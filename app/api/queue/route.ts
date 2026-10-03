import { getQueue, parseBbox } from "@/lib/data";
import { fail, json } from "@/lib/server";

// Alerts waiting for votes: location and progress only. Votes stay hidden until a task completes.
export async function GET(req: Request) {
  const bbox = parseBbox(new URL(req.url).searchParams.get("bbox"));
  if (bbox === "invalid") return fail(422, "invalid_bbox", "bbox must be minLon,minLat,maxLon,maxLat");
  return json({ tasks: await getQueue(bbox) }, 200, "public, s-maxage=60, stale-while-revalidate=300");
}
