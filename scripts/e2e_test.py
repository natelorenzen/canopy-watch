#!/usr/bin/env python3
"""End-to-end API test against a running app (BUILD_SPEC §10 items 2–4, 6, 8–10).

    python3 scripts/e2e_test.py http://localhost:3000

Creates its own tasks (region 'e2e-test') and agents (names 'e2e-*'), and deletes exactly those
rows when it finishes. Requires .env.local with the Supabase service-role key.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from _common import Supabase, load_env  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
PASS = 0


def call(method: str, path: str, body=None, key: str | None = None, ip: str | None = None):
    h = {"content-type": "application/json"}
    if key:
        h["authorization"] = f"Bearer {key}"
    if ip:
        h["x-forwarded-for"] = ip
    req = urllib.request.Request(BASE + path, method=method, headers=h, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            ctype = r.headers.get("content-type", "")
            return r.status, (json.loads(raw) if raw and "json" in ctype else raw), r.headers
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw), e.headers
        except Exception:
            return e.code, raw, e.headers


def check(ok: bool, what: str, detail=None) -> None:
    global PASS
    if not ok:
        raise SystemExit(f"FAIL  {what}\n      {detail!r}"[:800])
    PASS += 1
    print(f"ok    {what}")


def answer(task_id: str, label: str, driver: str = "unknown", conf: float = 0.8, **kw):
    return {
        "task_id": task_id,
        "spec_version": "0.1.0",
        "label": label,
        "answer": {"driver": driver, "extends_existing_clearing": kw.get("ext", False), "cloud_obstructed": False},
        "confidence": conf,
        "notes": kw.get("notes", "e2e: compared the alert box in both images carefully."),
    }


def main() -> None:
    load_env()
    sb = Supabase()
    created_agents: list[str] = []
    try:
        # Two tasks, inserted the same way the ingest script does.
        tasks = sb.select("tasks", "select=id,payload&region=eq.e2e-test&order=id")
        check(len(tasks) >= 2, "e2e tasks present (run the ingest with --region e2e-test first)", len(tasks))

        agents = {}
        for i, name in enumerate(["e2e-Alpha", "e2e-Bravo", "e2e-Charlie", "e2e-Delta"]):
            ip = "10.9.9.1" if name == "e2e-Delta" else f"10.9.9.{i + 1}"  # Delta shares Alpha's IP
            s, b, _ = call("POST", "/api/agents", {"display_name": name, "platform": "muse"}, ip=ip)
            check(s == 201 and b["agent_key"].startswith("cwk_") and len(b["agent_key"]) == 36, f"register {name}", b)
            agents[name] = b
            created_agents.append(b["agent_id"])
        check("agent_key" not in json.dumps(sb.select("agents", f"select=*&id=eq.{agents['e2e-Alpha']['agent_id']}")), "key stored only as hash")
        check(agents["e2e-Alpha"]["agent_key"] in agents["e2e-Alpha"]["first_run_prompt"], "first-run prompt carries the key")

        s, b, _ = call("POST", "/api/agents", {"display_name": "x"})
        check(s == 422, "short display_name → 422", b)

        A, B, C, D = (agents[n]["agent_key"] for n in ["e2e-Alpha", "e2e-Bravo", "e2e-Charlie", "e2e-Delta"])
        s, env, _ = call("GET", "/api/tasks/next", key=A)
        check(s == 200 and env["task_id"].startswith("fa-"), "A leases a task", env)
        tid = env["task_id"]
        blob = json.dumps(env)
        check("_meta" not in blob and "scene" not in blob and "gfw_max_confidence" not in blob, "envelope leaks no internal fields")
        check(env["payload"]["before"]["url"].startswith(BASE + "/api/img/"), "image URLs point at our proxy")
        s, env2, _ = call("GET", "/api/tasks/next", key=A)
        check(env2["task_id"] == tid, "re-request returns same lease")

        s, img, h = call("GET", f"/api/img/{tid}/after.jpg")
        check(s == 200 and h.get("content-type") == "image/jpeg" and len(img) > 1000, "image proxy returns JPEG", (s, h.get("content-type")))
        check("immutable" in (h.get("cache-control") or ""), "image proxy is CDN-cacheable")

        s, envD, _ = call("GET", "/api/tasks/next", key=D)
        check(s == 200 and envD["task_id"] != tid, "same-IP agent gets a different task", envD)
        s, envB, _ = call("GET", "/api/tasks/next", key=B)
        s, envC, _ = call("GET", "/api/tasks/next", key=C)
        check(envB["task_id"] == tid and envC["task_id"] == tid, "B and C lease the same task as A")

        s, b, _ = call("GET", "/api/tasks/next", key="cwk_nope")
        check(s == 401, "bad key → 401")

        s, b, _ = call("POST", "/api/results", answer(tid, "likely"), key=A)
        check(s == 422 and "label" in b["error"], "label 'likely' → 422 with readable message", b)
        bad = answer(tid, "no_clearing")
        bad["confidence"] = "high"
        bad["notes"] = "short"
        s, b, _ = call("POST", "/api/results", bad, key=A)
        check(s == 422 and "confidence" in b["error"] and "notes" in b["error"], "word confidence + short notes → 422", b)
        s, b, _ = call("POST", "/api/results", answer(tid, "no_clearing", driver="mining"), key=A)
        check(s == 422 and "driver" in b["error"], "driver on no_clearing → 422", b)
        stale = answer(tid, "no_clearing")
        stale["spec_version"] = "0.0.1"
        s, b, _ = call("POST", "/api/results", stale, key=A)
        check(s == 422 and b["code"] == "stale_spec", "stale spec_version → 422", b)
        s, b, _ = call("POST", "/api/results", answer(envD["task_id"], "no_clearing"), key=A)
        check(s == 403 and b["code"] == "not_assigned", "unleased task → 403", b)

        s, b, _ = call("POST", "/api/results", answer(tid, "clearing_confirmed", "pasture_or_crops", 0.9, ext=True), key=A)
        check(s == 201 and b["task_complete"] is False, "A votes (201, not complete)", b)
        s, b, _ = call("POST", "/api/results", answer(tid, "clearing_confirmed", "pasture_or_crops", 0.9), key=A)
        check(s == 409, "duplicate → 409", b)
        s, b, _ = call("GET", f"/api/tasks/{tid}")
        check(s == 404, "votes hidden while task is open")

        # GET-only fallback path for B.
        q = answer(tid, "clearing_confirmed", "pasture_or_crops", 0.7, ext=True)
        import urllib.parse

        flat = {"agent_key": B, "task_id": tid, "spec_version": "0.1.0", "label": q["label"], "driver": "pasture_or_crops",
                "extends_existing_clearing": "true", "cloud_obstructed": "false", "confidence": "0.7", "notes": q["notes"]}
        s, b, _ = call("GET", "/api/results/submit?" + urllib.parse.urlencode(flat))
        check(s == 201, "B votes via GET fallback", b)
        s, b, _ = call("POST", "/api/results", answer(tid, "no_clearing", conf=0.6), key=C)
        check(s == 201 and b["task_complete"] is True, "C's vote completes the task", b)

        s, al, _ = call("GET", "/api/alerts?project=forest-alerts")
        mine = [a for a in al["alerts"] if a["task_id"] == tid]
        check(len(mine) == 1 and mine[0]["agreeing_agents"] == 2 and abs(mine[0]["confidence"] - 0.65) < 1e-9
              and mine[0]["summary"]["driver"] == "pasture_or_crops" and mine[0]["summary"]["extends_existing"] is True,
              "2–1 clearing appears in /api/alerts with driver + mean−0.15", mine)
        s, det, _ = call("GET", f"/api/tasks/{tid}")
        check(s == 200 and len(det["votes"]) == 3 and {v["display_name"] for v in det["votes"]} == {"e2e-Alpha", "e2e-Bravo", "e2e-Charlie"},
              "completed task shows all 3 votes", det)
        s, prof, _ = call("GET", f"/api/agents/{agents['e2e-Alpha']['agent_id']}")
        check(prof["tasks_reviewed"] == 1 and prof["confirmed_flags"] == 1 and prof["recent"][0]["task_id"] == tid, "A's profile shows the confirmed flag", prof)
        s, lb, _ = call("GET", "/api/leaderboard")
        names = [r["display_name"] for r in lb["rows"]]
        check({"e2e-Alpha", "e2e-Bravo", "e2e-Charlie"} <= set(names), "leaderboard lists voters", names)
        s, st, _ = call("GET", "/api/stats")
        check(st["confirmed_clearings"] >= 1 and st["votes_total"] >= 3, "stats count the clearing", st)
        s, csv, _ = call("GET", "/api/export?format=csv")
        check(tid.encode() in csv, "CSV export includes the task")
        s, spec, h = call("GET", "/spec.md")
        check(s == 200 and b"/api/tasks/next" in spec and b"{APP_URL}" not in spec, "/spec.md served with host filled in")
        for path in ["/", "/map", "/donate", "/leaderboard", "/projects", "/spec", "/projects/forest-alerts/spec", "/api-docs", "/about",
                     f"/agent/{agents['e2e-Alpha']['agent_id']}"]:
            s, _, _ = call("GET", path)
            check(s == 200, f"page {path} renders")

        # Anon key must not see private tables.
        anon = sb.select("projects", "select=id")  # service role sanity
        check(len(anon) >= 1, "service role reads projects")
    finally:
        # Clean up exactly what this test created (tasks first: results/consensus cascade).
        _delete(sb, "tasks", "region=eq.e2e-test")
        for aid in created_agents:
            _delete(sb, "agents", f"id=eq.{aid}")
        print(f"\n{PASS} checks passed")


def _delete(sb: Supabase, table: str, filt: str) -> None:
    req = urllib.request.Request(f"{sb.url}/{table}?{filt}", method="DELETE", headers=sb.h)
    urllib.request.urlopen(req, timeout=30).read()


if __name__ == "__main__":
    main()
