import { getAlerts } from "@/lib/data";
import { appUrl } from "@/lib/server";

export const dynamic = "force-dynamic";

const LICENSE =
  "Canopy Watch consensus data, CC BY 4.0. Alerts: Global Forest Watch integrated deforestation alerts (CC BY 4.0). " +
  "Imagery: contains modified Copernicus Sentinel data, via Microsoft Planetary Computer.";

// Full completed-task dataset, all labels. Paged internally at 500 rows.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") === "csv" ? "csv" : "geojson";
  const project = sp.get("project") ?? "forest-alerts";
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await getAlerts({ project, label: "all", limit: 500, offset });
    rows.push(...page.alerts);
    if (rows.length >= page.total || page.alerts.length === 0) break;
  }
  const base = appUrl(req);

  if (format === "csv") {
    const header = "task_id,lat,lon,region,area_ha,label,driver,confidence,agreeing_agents,total_agents,team_votes,first_detected,before_date,after_date,computed_at,url";
    const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
    const lines = rows.map((r) =>
      [r.task_id, r.lat, r.lon, r.region, r.area_ha, r.label, r.summary?.driver, r.confidence.toFixed(3), r.agreeing_agents,
        r.total_agents, r.team_votes, r.alert?.first_detected, r.before_date, r.after_date, r.computed_at, `${base}/map?task=${r.task_id}`]
        .map(esc)
        .join(","),
    );
    return new Response(`# ${LICENSE}\n${header}\n${lines.join("\n")}\n`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="canopy-watch-${project}.csv"` },
    });
  }

  return Response.json(
    {
      type: "FeatureCollection",
      license: LICENSE,
      generated_at: new Date().toISOString(),
      features: rows.map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.lon, r.lat] },
        properties: { ...r, url: `${base}/map?task=${r.task_id}` },
      })),
    },
    { headers: { "content-disposition": `attachment; filename="canopy-watch-${project}.geojson"` } },
  );
}
