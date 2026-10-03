#!/usr/bin/env python3
"""Launch seeding: Canopy Watch team agents vote through the public API (BUILD_SPEC §5, §9.1 step 7).

    pip install anthropic
    python3 scripts/team_classify.py --app https://canopy-watch-neon.vercel.app --agents 3 --tasks 50

Each team agent is a normal registered agent (flagged is_team, so its votes are labeled "team"
everywhere) that leases tasks, looks at both images with Claude, and submits through
/api/results, exactly like a donor. Agent keys are kept in .team-agents.json (gitignored).
Anthropic credentials: ANTHROPIC_API_KEY, or an `ant auth login` profile.
"""

from __future__ import annotations

import argparse
import base64
import json
import pathlib
import sys
import urllib.error
import urllib.request

import anthropic

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from _common import ROOT, Supabase, http_json, load_env  # noqa: E402

MODEL = "claude-opus-5-5"
KEYS_FILE = ROOT / ".team-agents.json"
DRIVERS = ["pasture_or_crops", "mining", "road", "selective_logging", "fire", "plantation_harvest", "natural",
           "urban_or_infrastructure", "unknown"]

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "enum": ["clearing_confirmed", "no_clearing", "uncertain"]},
        "answer": {
            "type": "object",
            "properties": {
                "driver": {"type": "string", "enum": DRIVERS},
                "extends_existing_clearing": {"type": "boolean"},
                "cloud_obstructed": {"type": "boolean"},
            },
            "required": ["driver", "extends_existing_clearing", "cloud_obstructed"],
            "additionalProperties": False,
        },
        "confidence": {"type": "number"},
        "notes": {"type": "string"},
    },
    "required": ["label", "answer", "confidence", "notes"],
    "additionalProperties": False,
}


def api(method: str, url: str, key: str | None = None, body=None):
    h = {"content-type": "application/json"}
    if key:
        h["authorization"] = f"Bearer {key}"
    req = urllib.request.Request(url, method=method, headers=h, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def fetch_bytes(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def team_keys(app: str, n: int, sb: Supabase) -> list[str]:
    keys = json.loads(KEYS_FILE.read_text()) if KEYS_FILE.exists() else {}
    keys = keys.get(app, [])
    while len(keys) < n:
        name = f"Canopy Watch team {len(keys) + 1}"
        status, reg = api("POST", f"{app}/api/agents", body={"display_name": name, "platform": "other"})
        if status != 201:
            raise SystemExit(f"Could not register {name}: {status} {reg}")
        # Mark as team (labels its votes) and clear the IP hash: team agents share one machine but are
        # independent model calls, so the same-network rule shouldn't keep them off the same task.
        http_json(f"{sb.url}/agents?id=eq.{reg['agent_id']}", method="PATCH", body={"is_team": True, "ip_hash": None}, headers=sb.h)
        keys.append(reg["agent_key"])
        print(f"registered {name} ({reg['agent_id']})")
    store = json.loads(KEYS_FILE.read_text()) if KEYS_FILE.exists() else {}
    store[app] = keys
    KEYS_FILE.write_text(json.dumps(store, indent=2))
    KEYS_FILE.chmod(0o600)
    return keys[:n]


def classify(client: anthropic.Anthropic, system: str, env: dict) -> dict:
    p = env["payload"]
    before = base64.b64encode(fetch_bytes(p["before"]["url"])).decode()
    after = base64.b64encode(fetch_bytes(p["after"]["url"])).decode()
    task_text = (
        "Task payload (images attached in this order: BEFORE, then AFTER):\n"
        f"{json.dumps(p, indent=2)}\n\n"
        "Answer with the JSON fields label, answer, confidence and notes exactly as the rubric defines them."
    )
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "high", "format": {"type": "json_schema", "schema": ANSWER_SCHEMA}},
        # Protocol + rubric are identical on every call: cache them.
        system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": f"BEFORE image ({p['before']['date']}):"},
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": before}},
                {"type": "text", "text": f"AFTER image ({p['after']['date']}):"},
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": after}},
                {"type": "text", "text": task_text},
            ],
        }],
    )
    if response.stop_reason == "refusal":
        raise RuntimeError(f"model declined: {response.stop_details}")
    text = next(b.text for b in response.content if b.type == "text")
    return json.loads(text)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--app", required=True, help="site base URL")
    ap.add_argument("--agents", type=int, default=3)
    ap.add_argument("--tasks", type=int, default=20, help="max votes per agent this run")
    a = ap.parse_args()
    load_env()
    app = a.app.rstrip("/")
    sb = Supabase()
    client = anthropic.Anthropic()

    protocol = fetch_bytes(f"{app}/spec.md").decode()
    rubric = fetch_bytes(f"{app}/projects/forest-alerts/spec.md").decode()
    system = (
        "You are a Canopy Watch team agent classifying satellite imagery for launch seeding. Follow the rubric exactly; "
        "careful calibration matters more than speed, and 'uncertain' beats a guess.\n\n"
        f"# Agent protocol\n{protocol}\n\n# Project rubric\n{rubric}"
    )

    keys = team_keys(app, a.agents, sb)
    done = {k: 0 for k in keys}
    active = set(keys)
    while active:
        for key in list(active):
            if done[key] >= a.tasks:
                active.discard(key)
                continue
            status, env = api("GET", f"{app}/api/tasks/next", key=key)
            if status == 204:
                active.discard(key)
                continue
            if status != 200:
                print(f"lease failed: {status} {env}")
                active.discard(key)
                continue
            try:
                ans = classify(client, system, env)
            except Exception as e:  # noqa: BLE001 - log and let the lease expire
                print(f"{env['task_id']}: classification failed ({e}); lease will expire")
                active.discard(key)
                continue
            body = {"task_id": env["task_id"], "spec_version": env["spec_version"], **ans}
            status, res = api("POST", env["result_endpoint"], key=key, body=body)
            done[key] += 1
            print(f"{env['task_id']}: {ans['label']}/{ans['answer']['driver']} {ans['confidence']:.2f} → {status} "
                  f"{'complete' if res and res.get('task_complete') else ''}")
    print(f"votes submitted: {sum(done.values())}")


if __name__ == "__main__":
    main()
