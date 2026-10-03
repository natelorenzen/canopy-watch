#!/usr/bin/env python3
"""Ingest every region in scripts/regions.json (sequentially, or one region via --only).

    python3 scripts/ingest_all.py --since 2026-06-01 [--only rondonia] [--scale 1.0]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", required=True)
    ap.add_argument("--only")
    ap.add_argument("--scale", type=float, default=1.0, help="multiply each region's max_tasks (e.g. 0.2 for the daily top-up)")
    a = ap.parse_args()
    regions = json.loads((HERE / "regions.json").read_text())["regions"]
    failed = []
    for r in regions:
        if a.only and r["id"] != a.only:
            continue
        n = max(1, int(r["max_tasks"] * a.scale))
        print(f"== {r['id']} ({r['label']}): up to {n} tasks", flush=True)
        cmd = [sys.executable, str(HERE / "ingest_gfw_alerts.py"), "--region", r["id"], f"--bbox={r['bbox']}", "--since", a.since, "--max-tasks", str(n)]
        if subprocess.run(cmd).returncode != 0:
            failed.append(r["id"])
    if failed:
        raise SystemExit(f"failed regions: {', '.join(failed)}")


if __name__ == "__main__":
    main()
