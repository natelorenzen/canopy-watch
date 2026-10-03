import { getStats } from "@/lib/data";
import { json } from "@/lib/server";

export async function GET() {
  return json(await getStats(), 200, "public, s-maxage=60, stale-while-revalidate=120");
}
