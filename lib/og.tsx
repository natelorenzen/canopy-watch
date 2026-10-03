import { ImageResponse } from "next/og";
import { getFeaturedFind, getStats } from "@/lib/data";
import { driverLabel } from "@/lib/drivers";

export const OG_SIZE = { width: 1200, height: 630 };

const C = { bg: "#080c09", panel: "#0f1611", line: "#1f2d23", fg: "#dfe8e0", muted: "#869a8b", accent: "#5fd38a", warn: "#f2b84b" };

/** Share card: headline + the agents' latest confirmed find as before/after + live numbers. */
export async function shareCard(opts: { eyebrow: string; title: string; subtitle: string; cta: string }) {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const [featured, stats] = await Promise.all([getFeaturedFind().catch(() => null), getStats().catch(() => null)]);

  const img = (which: "before" | "after", date?: string) =>
    featured ? (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${base}/api/img/${featured.task_id}/${which}.jpg`} width={210} height={210} style={{ borderRadius: 12, border: `2px solid ${C.line}` }} />
        <div style={{ display: "flex", fontSize: 16, color: C.muted }}>
          {which} · {date}
        </div>
      </div>
    ) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: C.bg, color: C.fg, padding: 56, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560, flexShrink: 0, paddingRight: 32 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28 }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: C.accent }} />
            Canopy Watch
            <div style={{ display: "flex", fontSize: 16, color: C.warn, border: `1px solid ${C.warn}`, borderRadius: 999, padding: "2px 10px" }}>v1 experiment</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 17, letterSpacing: 3, color: C.accent, textTransform: "uppercase" }}>{opts.eyebrow}</div>
            <div style={{ display: "flex", fontSize: 50, fontWeight: 700, lineHeight: 1.08, color: "#fff" }}>{opts.title}</div>
            <div style={{ display: "flex", fontSize: 23, color: C.muted, lineHeight: 1.35 }}>{opts.subtitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", background: C.accent, color: C.bg, fontSize: 24, fontWeight: 700, padding: "12px 22px", borderRadius: 10 }}>{opts.cta}</div>
            <div style={{ display: "flex", fontSize: 22, color: C.muted }}>canopy.lorenzen.ai</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: 528, gap: 16, borderLeft: `1px solid ${C.line}`, paddingLeft: 32 }}>
          {featured ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", gap: 16 }}>
                {img("before", featured.before.date)}
                {img("after", featured.after.date)}
              </div>
              <div style={{ display: "flex", fontSize: 19, color: C.fg }}>
                Confirmed by {featured.consensus?.agreeing_agents} of {featured.consensus?.total_agents} agents · {driverLabel(featured.consensus?.summary?.driver)}
              </div>
            </div>
          ) : null}
          {stats ? (
            <div style={{ display: "flex", gap: 24, fontSize: 18, color: C.muted }}>
              <div style={{ display: "flex" }}>{stats.confirmed_clearings} clearings confirmed</div>
              <div style={{ display: "flex" }}>{stats.votes_total} agent votes</div>
            </div>
          ) : null}
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
