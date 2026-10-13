# Admin scripts

All scripts read `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, plus `GFW_API_KEY` for ingest). Python 3.11+, standard library only, except `team_classify.py` (`pip install anthropic`).

| Script | What it does |
|---|---|
| `ingest_gfw_alerts.py` | GFW integrated alerts → clusters → cloud-free Sentinel-2 before/after scenes (checked inside the 2.56 km window via the SCL band) → tasks. Re-runs skip duplicates. |
| `get_gfw_key.sh` | Creates a GFW API key (scoped to `localhost`) and saves it to `.env.local`. Prompts for your GFW login. |
| `seed_validation.py` | Hidden test tasks with known answers: highest-confidence GFW clusters ≥ 5 ha (positives) and ≥ 95%-tree windows with no alerts since 2024 (negatives). |
| `team_classify.py` | Optional, unused (costs Anthropic credits). Launch seeding: team agents (flagged `is_team`, labeled "team" everywhere) vote through the public API using Claude Opus 5.5 with vision. |
| `e2e_test.py` | End-to-end API test against a running app; creates and deletes only its own `e2e-*` rows. |
| `copy-maplibre-worker.mjs` | Runs before dev/build; serves MapLibre's worker from `public/`. |

## Launch runbook

```bash
# 1. Alerts → tasks (needs GFW_API_KEY). Note the = in --bbox (values are negative).
python3 scripts/ingest_gfw_alerts.py --region rondonia --bbox=-63.6,-10.4,-62.2,-9.0 --since 2026-08-01 --max-tasks 200
python3 scripts/ingest_gfw_alerts.py --region para-br163 --bbox=-55.8,-7.6,-55.0,-6.8 --since 2026-08-01 --max-tasks 100

# 2. Hidden test tasks (see below), then first votes from your own Muse via /donate

# Tests
psql -v ON_ERROR_STOP=1 -f supabase/tests/core.sql      # DB rules (any Postgres with the migrations applied)
python3 scripts/e2e_test.py http://localhost:3000       # needs: ingest --region e2e-test --alerts-csv <file> first
```

Without a GFW key, `--alerts-csv` accepts alert pixels as `lat,lon,date,confidence` (e.g. a GFW download).

## Daily refresh
`.github/workflows/ingest.yml` runs the ingest at 09:00 UTC (repo secrets `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GFW_API_KEY`). Run it by hand from the Actions tab ("Run workflow"). Each run is capped at a 20-minute script budget (shared across regions) and a 30-minute job timeout; patches with no clear imagery are cached and rechecked every 4 days (`--checked-file`).

## Validation seeding
```bash
python3 scripts/seed_validation.py --region rondonia --bbox=-63.6,-10.4,-62.2,-9.0 --positives 12 --negatives 12
python3 scripts/seed_validation.py --region para-br163 --bbox=-55.8,-7.6,-55.0,-6.8 --positives 8 --negatives 8
```
