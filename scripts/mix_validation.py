#!/usr/bin/env python3
"""Spread open validation tasks evenly through the front of the queue (BUILD_SPEC §5.2).

    python3 scripts/mix_validation.py [--front 40]

Agents lease tasks by priority, so validation tasks with lower priority than the real queue would
never be seen. This gives the open validation tasks priorities interleaved among the top `--front`
real tasks (e.g. every ~4th task), so every agent meets some of them early.
"""
from __future__ import annotations

import argparse
import random
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _common import Supabase, http_json, load_env  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--front", type=int, default=40, help="how deep into the queue to spread them")
    a = ap.parse_args()
    load_env()
    sb = Supabase()
    val_ids = {v["task_id"] for v in sb.select("validation_tasks", "select=task_id")}
    open_tasks = sb.select("tasks", "select=id,priority&status=eq.open&project_id=eq.forest-alerts&order=priority.desc&limit=10000")
    real = [t for t in open_tasks if t["id"] not in val_ids]
    vals = [t for t in open_tasks if t["id"] in val_ids]
    if not vals or not real:
        print("nothing to mix")
        return
    random.shuffle(vals)
    front = real[: max(a.front, len(vals) + 1)]
    step = len(front) / (len(vals) + 1)
    for i, v in enumerate(vals, start=1):
        # Same priority as the real task at this position; ties are broken by created_at.
        prio = front[min(int(i * step), len(front) - 1)]["priority"]
        http_json(f"{sb.url}/tasks?id=eq.{v['id']}", method="PATCH", body={"priority": prio}, headers=sb.h)
        print(f"{v['id']}: priority {v['priority']} → {prio}")
    print(f"mixed {len(vals)} validation tasks into the top {len(front)} of {len(real)} real tasks")


if __name__ == "__main__":
    main()
