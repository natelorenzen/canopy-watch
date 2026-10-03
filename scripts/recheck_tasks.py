#!/usr/bin/env python3
"""Re-screen open tasks' before/after scenes with the current quality checks and retire failures.

    python3 scripts/recheck_tasks.py [--dry-run]

Retired tasks drop out of the queue and the map; any votes already cast stay in the database.
"""
from __future__ import annotations

import argparse
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _common import Supabase, Window, http_json, load_env, scene_quality_ok  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    load_env()
    sb = Supabase()
    tasks = sb.select("tasks", "select=id,payload&status=eq.open&project_id=eq.forest-alerts&limit=10000")
    retired = 0
    for t in tasks:
        p = t["payload"]
        w, s, e, n = p["bbox"]
        win = Window((s + n) / 2, (w + e) / 2, w, s, e, n)
        bad = [which for which in ("before", "after") if not scene_quality_ok(p[which]["scene"], win)[0]]
        if bad:
            retired += 1
            print(f"{t['id']}: retire ({', '.join(bad)} fails quality checks)")
            if not a.dry_run:
                http_json(f"{sb.url}/tasks?id=eq.{t['id']}", method="PATCH", body={"status": "retired"}, headers=sb.h)
    print(f"checked {len(tasks)} open tasks, retired {retired}{' (dry run)' if a.dry_run else ''}")


if __name__ == "__main__":
    main()
