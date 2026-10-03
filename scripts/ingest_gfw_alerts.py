#!/usr/bin/env python3
"""Turn Global Forest Watch integrated deforestation alerts into Canopy Watch tasks (BUILD_SPEC §5.1).

    python3 scripts/ingest_gfw_alerts.py --region rondonia --bbox=-63.6,-10.4,-62.2,-9.0 --since 2026-08-01

Alert source: the GFW Data API (needs GFW_API_KEY in .env.local), or --alerts-csv with columns
lat,lon,date,confidence (one row per 10 m alert pixel, e.g. a GFW download).

Steps: fetch alert pixels → cluster neighbours (≈100 m grid, 8-connected) → drop small clusters →
2.56 km window per cluster → pick cloud-free Sentinel-2 scenes before/after via Planetary Computer →
insert tasks (duplicates skipped by external_ref).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import math
import sys
from collections import defaultdict

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _common import IMG_PX, WINDOW_KM, Supabase, Window, find_scene, gfw_headers, gfw_query_url, http_json, load_env, polygon_of  # noqa: E402

PIXEL_HA = 0.01  # one 10 m alert pixel
GRID_DEG = 0.0009  # ≈100 m clustering cell
CONF_RANK = {"low": 1, "nominal": 1, "high": 2, "highest": 3}


def _fetch_cell(cell: list[float], since: str, until: str, headers: dict, depth: int = 0) -> list[dict]:
    sql = (
        "SELECT latitude, longitude, gfw_integrated_alerts__date, gfw_integrated_alerts__confidence "
        f"FROM results WHERE gfw_integrated_alerts__date >= '{since}' AND gfw_integrated_alerts__date <= '{until}'"
    )
    try:
        res = http_json(gfw_query_url("gfw_integrated_alerts"), method="POST",
                        body={"sql": sql, "geometry": polygon_of(cell)}, headers=headers, timeout=300, retries=2)
    except RuntimeError as e:
        # GFW's raster lambda caps responses at ~6 MB; busy frontier cells exceed it. Split into quarters.
        if "payload size" not in str(e) or depth >= 5:
            raise
        w, s, e_, n = cell
        mx, my = (w + e_) / 2, (s + n) / 2
        out: list[dict] = []
        for q in ([w, s, mx, my], [mx, s, e_, my], [w, my, mx, n], [mx, my, e_, n]):
            out += _fetch_cell(q, since, until, headers, depth + 1)
        return out
    return [
        {
            "lat": float(r["latitude"]),
            "lon": float(r["longitude"]),
            "date": str(r["gfw_integrated_alerts__date"])[:10],
            "confidence": str(r["gfw_integrated_alerts__confidence"]).lower(),
        }
        for r in res.get("data", [])
    ]


def fetch_gfw(bbox: list[float], since: str, until: str) -> list[dict]:
    """POST /query/json with the area as GeoJSON (the GET form has no geometry parameter), in ≤0.25°
    cells that are split further when a response would be too large."""
    headers = gfw_headers()
    w, s, e, n = bbox
    step = 0.25
    rows: list[dict] = []
    lat = s
    while lat < n:
        lon = w
        while lon < e:
            rows += _fetch_cell([lon, lat, min(lon + step, e), min(lat + step, n)], since, until, headers)
            lon += step
        lat += step
        print(f"  … {len(rows)} alert pixels so far", file=sys.stderr)
    return rows


def read_csv(path: str) -> list[dict]:
    with open(path) as f:
        return [
            {"lat": float(r["lat"]), "lon": float(r["lon"]), "date": r["date"][:10], "confidence": r.get("confidence", "nominal").lower()}
            for r in csv.DictReader(f)
        ]


def cluster(pixels: list[dict]) -> list[dict]:
    cells: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for p in pixels:
        cells[(math.floor(p["lon"] / GRID_DEG), math.floor(p["lat"] / GRID_DEG))].append(p)

    parent = {c: c for c in cells}

    def find(c):
        while parent[c] != c:
            parent[c] = parent[parent[c]]
            c = parent[c]
        return c

    for (x, y) in cells:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                nb = (x + dx, y + dy)
                if nb in cells:
                    ra, rb = find((x, y)), find(nb)
                    if ra != rb:
                        parent[ra] = rb

    groups: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for c, ps in cells.items():
        groups[find(c)].extend(ps)

    out = []
    for ps in groups.values():
        lats = [p["lat"] for p in ps]
        lons = [p["lon"] for p in ps]
        dates = sorted(p["date"] for p in ps)
        out.append(
            {
                "lat": sum(lats) / len(lats),
                "lon": sum(lons) / len(lons),
                "min_lat": min(lats), "max_lat": max(lats), "min_lon": min(lons), "max_lon": max(lons),
                "area_ha": round(len(ps) * PIXEL_HA, 2),
                "first": dates[0],
                "last": dates[-1],
                "max_conf": max(CONF_RANK.get(p["confidence"], 1) for p in ps),
            }
        )
    return out


def pixel_box(win: Window, c: dict) -> dict:
    x0, y0 = win.to_px(c["max_lat"], c["min_lon"])
    x1, y1 = win.to_px(c["min_lat"], c["max_lon"])
    pad = 3
    clamp = lambda v: max(0, min(IMG_PX, round(v)))  # noqa: E731
    return {"x0": clamp(x0 - pad), "y0": clamp(y0 - pad), "x1": clamp(x1 + pad), "y1": clamp(y1 + pad)}


def day(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def build_task(c: dict, region: str) -> dict | None:
    win = Window.around(c["lat"], c["lon"])
    first, last = day(c["first"]), day(c["last"])
    before = find_scene(win, str(first - dt.timedelta(days=400)), str(first - dt.timedelta(days=30)), newest=True)
    if not before:
        return None
    today = dt.date.today()
    # GFW dates an alert by the observation that saw the change, so a scene from that day on shows it.
    after_start = last
    if after_start > today:
        return None
    # Prefer the newest clear scene within 60 days after the alert; fall back to any later one.
    after = find_scene(win, str(after_start), str(min(today, after_start + dt.timedelta(days=60))), newest=True) or find_scene(
        win, str(after_start), str(today), newest=False
    )
    if not after:
        return None

    days_since_2026 = (first - dt.date(2026, 1, 1)).days
    return {
        "project_id": "forest-alerts",
        "external_ref": f"gfw:{c['lat']:.4f},{c['lon']:.4f}:{c['first']}",
        "lat": round(c["lat"], 5),
        "lon": round(c["lon"], 5),
        "region": region,
        "area_ha": c["area_ha"],
        "required_votes": 3,
        "priority": days_since_2026 + int(10 * math.log2(1 + c["area_ha"])),
        "payload": {
            "center": {"lat": round(c["lat"], 5), "lon": round(c["lon"], 5)},
            "window_km": WINDOW_KM,
            "bbox": win.bbox,
            "alert": {
                "first_detected": c["first"],
                "last_detected": c["last"],
                "approx_area_ha": c["area_ha"],
                "pixel_box": pixel_box(win, c),
            },
            "before": before,
            "after": after,
            "_meta": {"source": "gfw_integrated_alerts", "gfw_max_confidence": c["max_conf"]},
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--region", required=True)
    ap.add_argument("--bbox", required=True, help="minLon,minLat,maxLon,maxLat (use --bbox=... since values are negative)")
    ap.add_argument("--since", required=True, help="YYYY-MM-DD (earliest alert date)")
    ap.add_argument("--until", default=str(dt.date.today()))
    ap.add_argument("--min-ha", type=float, default=0.5)
    ap.add_argument("--max-tasks", type=int, default=300)
    ap.add_argument("--alerts-csv", help="use a CSV of alert pixels instead of the GFW API")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    load_env()

    bbox = [float(v) for v in a.bbox.split(",")]
    pixels = read_csv(a.alerts_csv) if a.alerts_csv else fetch_gfw(bbox, a.since, a.until)
    # Patches whose last detection is ≥ 7 days old first (a clear after-scene is likely by now), newest
    # first within each group; the freshest patches are retried by tomorrow's run.
    settle = str(dt.date.today() - dt.timedelta(days=7))
    clusters = sorted((c for c in cluster(pixels) if c["area_ha"] >= a.min_ha),
                      key=lambda c: (c["last"] <= settle, c["first"], c["area_ha"]), reverse=True)
    print(f"{len(pixels)} alert pixels → {len(clusters)} clusters ≥ {a.min_ha} ha", file=sys.stderr)

    # Patches grow as GFW adds detections, which shifts their centroid and first date. Skip any patch
    # within ~300 m of a task we already have, so the daily refresh doesn't duplicate a clearing.
    existing: list[tuple[float, float]] = []
    if not a.dry_run:
        w, s_, e, n = bbox
        rows = Supabase().select("tasks", f"select=lat,lon&project_id=eq.forest-alerts&lon=gte.{w}&lon=lte.{e}&lat=gte.{s_}&lat=lte.{n}&limit=10000")
        existing = [(r["lat"], r["lon"]) for r in rows]
    near = lambda c: any(abs(c["lat"] - la) < 0.003 and abs(c["lon"] - lo) < 0.003 for la, lo in existing)  # noqa: E731
    before_n = len(clusters)
    clusters = [c for c in clusters if not near(c)]
    if before_n != len(clusters):
        print(f"{before_n - len(clusters)} clusters already covered by existing tasks", file=sys.stderr)

    sb = None if a.dry_run else Supabase()
    tasks, batch, skipped, inserted = [], [], 0, 0

    def flush() -> None:
        nonlocal inserted
        if sb and batch:
            inserted += len(sb.insert("tasks", batch, on_conflict="project_id,external_ref", ignore_duplicates=True))
        batch.clear()

    for c in clusters:
        if len(tasks) >= a.max_tasks:
            break
        t = build_task(c, a.region)
        if t:
            tasks.append(t)
            batch.append(t)
            existing.append((c["lat"], c["lon"]))
            if len(batch) >= 5:
                flush()  # save as we go so tasks appear on the site immediately
        else:
            skipped += 1
        if (len(tasks) + skipped) % 10 == 0:
            print(f"  … {len(tasks)} tasks built, {skipped} without clear imagery", file=sys.stderr)
    flush()

    print(f"Built {len(tasks)} tasks ({skipped} clusters skipped: no cloud-free scene yet)", file=sys.stderr)
    if a.dry_run:
        import json

        print(json.dumps(tasks[:3], indent=2))
        return
    total_ha = sum(t["area_ha"] for t in tasks)
    print(f"Inserted {inserted} new tasks ({len(tasks) - inserted} already existed). Alert area: {total_ha:.1f} ha.")


if __name__ == "__main__":
    main()
