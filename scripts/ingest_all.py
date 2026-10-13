#!/usr/bin/env python3
"""Ingest every region in scripts/regions.json (sequentially, or one region via --only).

    python3 scripts/ingest_all.py --since 2026-06-01 [--only rondonia] [--scale 1.0] [--time-budget 900] [--rotate]

With --time-budget, each region gets an equal share of whatever time is left for imagery checks, so
one slow region can't starve the rest. --rotate ingests just one region per day, cycling through
regions.json, which keeps the daily run short (fetching a busy region's alerts alone takes minutes).
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--only")
    ap.add_argument("--scale", type=float, default=1.0, help="multiply each region's max_tasks (e.g. 0.2 for the daily top-up)")
    ap.add_argument("--time-budget", type=float, help="total seconds for all regions, shared out evenly")
    ap.add_argument("--checked-file", help="passed through to ingest_gfw_alerts.py")
    ap.add_argument("--rotate", action="store_true", help="only today's region (cycles through regions.json by date)")
    a = ap.parse_args()
    regions = [r for r in json.loads((HERE / "regions.json").read_text())["regions"] if not a.only or r["id"] == a.only]
    if a.rotate:
        regions = [regions[dt.date.today().toordinal() % len(regions)]]
    started = time.monotonic()
    failed = []
    for i, r in enumerate(regions):
        n = max(1, int(r["max_tasks"] * a.scale))
        print(f"== {r['id']} ({r['label']}): up to {n} tasks", flush=True)
        cmd = [sys.executable, str(HERE / "ingest_gfw_alerts.py"), "--region", r["id"], f"--bbox={r['bbox']}", "--since", a.since, "--max-tasks", str(n)]
        if a.time_budget:
            share = (a.time_budget - (time.monotonic() - started)) / (len(regions) - i)
            cmd += ["--time-budget", str(max(30, int(share)))]
        if a.checked_file:
            cmd += ["--checked-file", a.checked_file]
        if subprocess.run(cmd).returncode != 0:
            failed.append(r["id"])
    if failed:
        raise SystemExit(f"failed regions: {', '.join(failed)}")


if __name__ == "__main__":
    main()
