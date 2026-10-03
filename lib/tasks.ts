// Task payloads as stored vs. as sent to agents.
//
// Stored payloads reference Sentinel-2 scenes by ID plus a bbox; the image URLs agents see always
// point at our own /api/img proxy (Muse asks its user to approve each new host, so agents should
// only ever need one). Keys starting with "_" are internal (e.g. the GFW confidence, which would
// anchor the agent's answer) and are stripped before anything leaves the server.

export type StoredPayload = {
  center: { lat: number; lon: number };
  window_km: number;
  bbox: [number, number, number, number];
  alert: {
    first_detected: string;
    last_detected: string;
    approx_area_ha: number;
    pixel_box: { x0: number; y0: number; x1: number; y1: number };
  };
  before: { date: string; scene: string; cloud_cover: number };
  after: { date: string; scene: string; cloud_cover: number };
  _meta?: Record<string, unknown>;
};

export type TaskRow = {
  id: string;
  project_id: string;
  payload: StoredPayload;
  lat: number;
  lon: number;
  region: string | null;
  area_ha: number | null;
  status: string;
  required_votes: number;
  vote_count: number;
  created_at: string;
};

const MPC = "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox";

export function upstreamImageUrl(p: StoredPayload, which: "before" | "after") {
  const bbox = p.bbox.map((n) => n.toFixed(5)).join(",");
  return `${MPC}/${bbox}.jpg?collection=sentinel-2-l2a&item=${encodeURIComponent(p[which].scene)}&assets=visual&max_size=256`;
}

export function agentPayload(taskId: string, p: StoredPayload, appUrl: string) {
  return {
    center: p.center,
    window_km: p.window_km,
    alert: p.alert,
    before: { date: p.before.date, url: `${appUrl}/api/img/${taskId}/before.jpg`, cloud_cover: p.before.cloud_cover },
    after: { date: p.after.date, url: `${appUrl}/api/img/${taskId}/after.jpg`, cloud_cover: p.after.cloud_cover },
  };
}

export function envelope(t: TaskRow, specVersion: string, appUrl: string, leaseExpiresAt: string) {
  return {
    task_id: t.id,
    project: t.project_id,
    spec_url: `${appUrl}/projects/${t.project_id}/spec.md`,
    spec_version: specVersion,
    lease_expires_at: leaseExpiresAt,
    payload: agentPayload(t.id, t.payload, appUrl),
    result_endpoint: `${appUrl}/api/results`,
  };
}
