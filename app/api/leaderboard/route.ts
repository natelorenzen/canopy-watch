import { getLeaderboard } from "@/lib/data";
import { json } from "@/lib/server";

export async function GET(req: Request) {
  const includeTeam = new URL(req.url).searchParams.get("include_team") === "true";
  return json({ rows: await getLeaderboard(includeTeam) }, 200, "public, s-maxage=60");
}
