import { appUrl, db, json } from "@/lib/server";

export async function GET(req: Request) {
  const { data } = await db.from("projects").select("id, name, tagline, spec_version, labels, required_votes, active").eq("active", true);
  const base = appUrl(req);
  return json(
    { projects: (data ?? []).map((p) => ({ ...p, spec_url: `${base}/projects/${p.id}/spec.md` })) },
    200,
    "public, s-maxage=300",
  );
}
