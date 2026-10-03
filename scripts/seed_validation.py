#!/usr/bin/env python3
"""Seed hidden validation tasks with known answers (BUILD_SPEC §5.2).

    python3 scripts/seed_validation.py --region rondonia --bbox=-63.6,-10.4,-62.2,-9.0 --positives 20 --negatives 20

Positives (truth clearing_confirmed): GFW alert clusters that reached `highest` confidence (several
systems agree) and cover ≥ 5 ha.
Negatives (truth no_clearing): random windows that are ≥ 95% trees in the Esri/Impact 10 m annual
land cover (latest year on Planetary Computer) AND have no GFW alert since 2024-01-01.

Validation tasks look exactly like real tasks (same payload shape, window, scene rules, synthetic
alert box for negatives); only the validation_tasks table knows. Needs GFW_API_KEY.
"""

from __future__ import annotations

import argparse
import datetime as dt
import random
import sys
import urllib.parse

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _common import (  # noqa: E402
    IMG_PX, MPC_STAC, Supabase, Window, gfw_headers, gfw_query_url, http_json, load_env,
)
from ingest_gfw_alerts import build_task, cluster, fetch_gfw  # noqa: E402

MPC_STATS = "https://planetarycomputer.microsoft.com/api/data/v1/item/statistics"
LULC_TREES = 2  # io-lulc-annual-v02 class 2 = trees


def tree_share(win: Window) -> float | None:
    res = http_json(MPC_STAC, method="POST", body={
        "collections": ["io-lulc-annual-v02"], "intersects": win.polygon(), "limit": 1,
        "sortby": [{"field": "datetime", "direction": "desc"}],
    })
    items = res.get("features", [])
    if not items:
        return None
    qs = urllib.parse.urlencode({"collection": "io-lulc-annual-v02", "item": items[0]["id"], "assets": "data", "categorical": "true"})
    stats = http_json(f"{MPC_STATS}?{qs}", method="POST", body={"type": "Feature", "properties": {}, "geometry": win.polygon()})
    s = next(iter(((stats.get("properties") or {}).get("statistics") or {}).values()), None)
    if not s:
        return None
    counts, classes = s["histogram"]
    total = sum(counts) or 1
    return sum(c for c, k in zip(counts, classes) if int(k) == LULC_TREES) / total


def alert_count(win: Window, since: str) -> int:
    sql = f"SELECT COUNT(*) AS n FROM results WHERE gfw_integrated_alerts__date >= '{since}'"
    res = http_json(gfw_query_url("gfw_integrated_alerts"), method="POST",
                    body={"sql": sql, "geometry": win.polygon()}, headers=gfw_headers(), timeout=300)
    rows = res.get("data", [])
    return int(rows[0].get("n", rows[0].get("count", 0))) if rows else 0


def negative_task(lat: float, lon: float, region: str, rng: random.Random) -> dict | None:
    """A synthetic 'alert' in intact forest, shaped like a real one."""
    today = dt.date.today()
    first = today - dt.timedelta(days=rng.randint(30, 75))
    last = first + dt.timedelta(days=rng.randint(0, 20))
    area = round(rng.uniform(1.0, 15.0), 1)
    side_px = max(10, round((area * 10_000) ** 0.5 / 10))  # 10 m pixels
    c = {
        "lat": lat, "lon": lon, "area_ha": area, "first": str(first), "last": str(last), "max_conf": 1,
        # Box of the synthetic alert, centered; pixel_box() pads it like real clusters.
        "min_lat": lat - side_px * 5 / 111_320, "max_lat": lat + side_px * 5 / 111_320,
        "min_lon": lon - side_px * 5 / 111_320, "max_lon": lon + side_px * 5 / 111_320,
    }
    t = build_task(c, region)
    if t:
        t["external_ref"] = f"val-neg:{lat:.4f},{lon:.4f}"
        t["payload"]["_meta"] = {"source": "validation_negative"}
    return t


def insert_with_truth(sb: Supabase, task: dict, truth: str, source: str, detail: dict) -> str | None:
    sb.insert("tasks", [task], on_conflict="project_id,external_ref", ignore_duplicates=True)
    ref = urllib.parse.quote(task["external_ref"], safe="")
    rows = sb.select("tasks", f"select=id&project_id=eq.forest-alerts&external_ref=eq.{ref}")
    if not rows:
        return None
    tid = rows[0]["id"]
    sb.insert("validation_tasks", [{"task_id": tid, "truth_label": truth, "source": source, "detail": detail}],
              on_conflict="task_id", ignore_duplicates=True)
    return tid


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--region", required=True)
    ap.add_argument("--bbox", required=True, help="minLon,minLat,maxLon,maxLat (use --bbox=...)")
    ap.add_argument("--positives", type=int, default=20)
    ap.add_argument("--negatives", type=int, default=20)
    ap.add_argument("--since", default=str(dt.date.today() - dt.timedelta(days=90)), help="alert window for positives")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    load_env()
    sb = None if a.dry_run else Supabase()
    rng = random.Random(a.seed)
    bbox = [float(v) for v in a.bbox.split(",")]

    # ── Positives ──
    made_pos = 0
    if a.positives:
        clusters = [c for c in cluster(fetch_gfw(bbox, a.since, str(dt.date.today() - dt.timedelta(days=5))))
                    if c["max_conf"] >= 3 and c["area_ha"] >= 5]
        rng.shuffle(clusters)
        print(f"{len(clusters)} highest-confidence clusters ≥ 5 ha", file=sys.stderr)
        for c in clusters:
            if made_pos >= a.positives:
                break
            t = build_task(c, a.region)
            if not t:
                continue
            if sb:
                insert_with_truth(sb, t, "clearing_confirmed", "gfw_highest_conf_large", {"area_ha": c["area_ha"]})
            made_pos += 1
            print(f"  + positive {t['external_ref']}", file=sys.stderr)

    # ── Negatives ──
    made_neg, tries = 0, 0
    w, s, e, n = bbox
    while made_neg < a.negatives and tries < a.negatives * 15:
        tries += 1
        lat, lon = rng.uniform(s, n), rng.uniform(w, e)
        win = Window.around(lat, lon)
        share = tree_share(win)
        if share is None or share < 0.95:
            continue
        if alert_count(win, "2024-01-01") > 0:
            continue
        t = negative_task(lat, lon, a.region, rng)
        if not t:
            continue
        if sb:
            insert_with_truth(sb, t, "no_clearing", "stable_forest_lulc_no_alerts", {"tree_share": round(share, 3)})
        made_neg += 1
        print(f"  + negative {t['external_ref']} (trees {share:.0%})", file=sys.stderr)

    print(f"Validation tasks: {made_pos} positive, {made_neg} negative{' (dry run, nothing written)' if a.dry_run else ''}.")
    if IMG_PX != 256:
        print("warning: image size changed; check synthetic alert boxes", file=sys.stderr)


if __name__ == "__main__":
    main()
