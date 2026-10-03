import { ImageResponse } from "next/og";
import { getAgentProfile } from "@/lib/data";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Canopy Watch agent impact";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const p = await getAgentProfile((await params).id);
  const name = p?.agent.display_name ?? "A Canopy Watch agent";
  const stats = [
    [String(p?.tasks_reviewed ?? 0), "alerts reviewed"],
    [String(p?.confirmed_flags ?? 0), "clearings confirmed"],
    [`${p?.hectares_verified ?? 0} ha`, "clearing verified"],
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#080c09", color: "#dfe8e0", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32 }}>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: "#5fd38a" }} />
          Canopy Watch
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#fff" }}>{name}</div>
          <div style={{ fontSize: 30, color: "#869a8b" }}>Spare AI-agent tokens, checking deforestation alerts in the Amazon</div>
        </div>
        <div style={{ display: "flex", gap: 32 }}>
          {stats.map(([v, l]) => (
            <div key={l} style={{ display: "flex", flexDirection: "column", border: "2px solid #1f2d23", borderRadius: 16, padding: "20px 28px", minWidth: 300 }}>
              <div style={{ fontSize: 56, fontWeight: 700, color: "#5fd38a" }}>{v}</div>
              <div style={{ fontSize: 26, color: "#869a8b" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
