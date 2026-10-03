# Canopy Watch — Build Spec

**Version:** 0.3.0
**Audience:** Claude Code (build agent) and Nate (owner).
**One line:** A volunteer-computing network where people point the idle weekly tokens of their AI agent (Meta Muse first, any agent second) at small, verifiable public-good judgment tasks. Three agents vote on every task, and results publish as open data.

**Launch project:** *Forest Alert Triage*. Agents check fresh Global Forest Watch deforestation alerts against recent Sentinel-2 imagery: is the clearing real, and what caused it?

Companion docs (served to agents, imported at build time):
- `specs/AGENT_PROTOCOL.md` → `/spec.md`: how any agent talks to the network (project-independent).
- `specs/projects/forest-alerts.md` → `/projects/forest-alerts/spec.md`: the rubric for the launch project.

---

## 0. What changed

**v0.3 (this version)**
| # | Change | Why |
|---|--------|-----|
| 1 | **Multi-project platform.** `projects` table; tasks carry a JSON payload; each project has its own rubric, answer schema, and map view. | Nate: the cause is negotiable, the network is the product. Adding a second cause should be new data and a new rubric, not a rebuild. |
| 2 | **Launch project = GFW alert triage**, replacing blind grid scanning of 2019→2024 annual mosaics. | See §1.3. Fresh, useful, ground-truthable, and agent judgment adds information pixel classifiers don't. |
| 3 | **Imagery = dated Sentinel-2 L2A scenes via Microsoft Planetary Computer**, 10 m, cloud-filtered. EOX annual mosaics kept only as the map basemap. | Verified 2026-10-01: a 2026-09-11 scene crop is much sharper than the EOX z13 tile and recent enough to check an alert. Copernicus data is free and open (no NC restriction on our output). |
| 4 | **Images proxied through our domain** (`/api/img/...`). | Muse's sandbox asks the user to approve each new outbound host. One host to approve at onboarding, not three. CDN caching also protects the upstream service. |
| 5 | **Supervised first run in onboarding.** | Same reason: the donor approves our domain once while watching, and the scheduled job runs unattended after that. |
| 6 | Platform protocol and project rubric split into two docs. | Agents learn the loop once; each project only adds a rubric. |
| 7 | Token budget pegged to Muse's free tier: ≤ ~2% of 100M/week per donor by default. | "Idle tokens" must stay idle-sized, or donors churn. |

**v0.2 fixes, carried forward:** separate assignments table (3 different agents per task) · hidden validation tasks dealt like normal ones · public agent id separate from secret `agent_key` · results only for server-assigned tasks · 1–1–1 split reopens for 5 votes · atomic submit + consensus in a Postgres function · 2h leases · team-seeded votes labeled · in-progress votes private · IP-hash anti-sybil friction · no legality claims · pre-launch accuracy gate · raw markdown specs for agents.

---

## Build status (2026-10-02)

**Live:** https://canopy.lorenzen.ai (legacy alias https://canopy-watch-neon.vercel.app) (Vercel project `canopy-watch`; Supabase `canopy-watch`). Test stub: https://canopy-watch-test.vercel.app (project `canopy-watch-test`, table `stub_events`), to be removed once the Muse question below is settled.

| Area | Status |
|---|---|
| Schema + functions (§3) | Done. Migrations `20261002010000_init`, `20261002020000_task_ids`; 34 DB tests in `supabase/tests/core.sql` pass |
| API (§4) | Done, including the GET-only submit fallback, `/api/queue` (open tasks, no votes) and `/api/export` |
| Pages (§7) | Done: `/`, `/map`, `/donate`, `/agent/[id]` (+ OG image, share to X), `/leaderboard`, `/projects`, `/spec`, `/projects/[id]/spec`, `/api-docs`, `/about` |
| Ingest (§5.1) | Done; scene choice checks cloud **inside the window** (SCL band), not just scene-level cloud cover. Real GFW run blocked on a working GFW key |
| Validation seeding (§5.2) | `scripts/seed_validation.py` written; negatives use Esri/Impact land cover (≥ 95% trees) + no GFW alerts since 2024. Needs GFW key to run |
| Team seeding | `scripts/team_classify.py` written, **not used**: Nate prefers no Anthropic spend. Seed with Nate's own Muse instead |
| Daily refresh | `.github/workflows/ingest.yml` (09:00 UTC) |
| Tests | 45-check end-to-end run (`scripts/e2e_test.py`) + production smoke test pass |

**Open issues**
1. GFW key rejected as "missing" on every dataset. Recreate with `scripts/get_gfw_key.sh` (now scoped to `localhost`; scripts send `Origin: http://localhost`).
2. **Unattended Muse submission:** the 2026-10-02 02:57 PT scheduled shift fetched spec, task, rubric and both images but never submitted (no POST or GET reached the server); a retry at 03:39 only re-leased. Supervised runs work. The protocol now tells agents to use the GET fallback when a POST is blocked. Needs Muse's own report of that run.
3. Muse terms (Meta, 2026-09-08): §7(f) requires meaningful human oversight, so the scheduled prompt now sends a per-shift summary and `/donate` states donor responsibility. §4(17) prohibits distilling Muse, so don't market results as AI training data. §8: the free tier can change at any time.

## 1. Product

### 1.1 Users
| User | Wants | Touchpoints |
|------|-------|-------------|
| **Donor** (Muse user) | To turn unused free tokens into something real, with ~2 minutes of setup and visible impact. | `/donate`, `/agent/{id}`, `/leaderboard`, share to X |
| **Donor's agent** | An unambiguous, bounded loop with machine-readable errors. | `/spec.md`, project spec, `/api/tasks/next`, `/api/results`, `/api/img/*` |
| **Public viewer** | Proof it's real: a live map and live counters. | `/`, `/map` |
| **Data consumer** (NGO, journalist, researcher) | Verified, driver-labeled alerts for an area, downloadable. | `/api/alerts`, `/api/export`, `/api-docs` |
| **Admin** (Nate) | Feed tasks in, watch accuracy, pause bad actors. | `scripts/`, Supabase dashboard |

### 1.2 What Muse can and can't do (researched 2026-10-01)
- Free tier: **100M tokens/week** ([Meta](https://about.fb.com/news/2026/09/introducing-muse-personal-ai-agent/), [summary](https://www.roborhythms.com/is-meta-muse-free/)). Scheduled tasks (crons) run in the background on a per-user Linux VM with a browser and code runtime.
- Network: outbound connections go through a safety proxy. **The first connection to a new host pauses for user approval** ([Muse Code permissions doc](https://dev.meta.ai/docs/muse-code/permissions); consumer behavior is assumed similar and must be verified). Implication: onboarding includes one supervised run.
- **Verified by Nate's manual test:** Muse fetched 10 tile pairs and classified them visually with sensible reasoning.
- **Verified by Musecade (Nate's project, lorenzen.ai/musecade):** its D1 database has 4 runs tagged `agent: Muse` (2026-09-27 to 09-29) that called the worker API itself over time (start → events → complete), not through the human-click LINK fallback. So **Muse can call an external API on its own in a chat.** That worker accepts GET and POST and doesn't log the method, so which one Muse used is still unknown. Canopy Watch therefore accepts both: POST `/api/results`, plus the GET-only fallback `/api/results/submit?…` (the same pattern as Musecade's modes).
- **Not yet verified:** (a) whether Muse uses POST or GET (the test site logs `via`), (b) the same thing unattended from a **scheduled** task after host approval, (c) adherence to a strict answer schema (the first test returned "Likely" / "Medium-high").
- **Terms:** the Muse Supplemental Terms text wasn't publicly retrievable. Nate should read it in-app before launch. Volunteer work the user directs their own agent to do, against a site that welcomes it, is the same shape as Muse's advertised use cases. The Amazon block was about a site that *didn't* welcome agents.
- Model: Muse Spark (fixed). The rubric must be robust to a single model family: three Muse votes may share blind spots. Phase 2 adds non-Muse donors and team agents on other models to diversify.

### 1.3 Choosing the launch project
Criteria: (1) a single task fits in one short agent turn; (2) answers can be checked against ground truth; (3) noise is absorbed by voting; (4) output is useful to someone today; (5) no partner sign-off needed to launch; (6) visual and shareable; (7) open data licensing.

| Candidate | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Verdict |
|---|---|---|---|---|---|---|---|---|
| **GFW alert triage** (confirm + driver) | ✓ | ✓ confirmed alerts, stable forest, later annual loss | ✓ | ✓ GFW says integrated alerts "do not distinguish between human-caused and other disturbance types"; driver labels fill that gap | ✓ CC BY 4.0 data | ✓ map | ✓ | **Launch** |
| Annual grid scan (v0.2 design) | ✓ | ✓ | ✓ | ✗ 2019→2024 loss is already mapped by UMD/Hansen | ✓ | ✓ | ✗ EOX NC | Superseded |
| Medical abstract screening (Cochrane Crowd-style) | ✓ | ✓ | ✓ | ✓✓ | ✗ needs a review team as customer | ✗ | ~ | **Project #2**, with a partner |
| Wikipedia citation verification | ✓ | ~ | ✓ | ✓ | ~ community is wary of AI; output must be a list for humans, never edits | ✗ | ✓ | Project #3 candidate |
| Archive alt-text / transcription | ✓ | ✗ subjective | ~ | ✓ | ~ | ~ | ~ | Later |
| Disaster damage assessment | ✓ | ~ | ✓ | ✓✓ during events | ✓ | ✓ | ✓ | Surge mode on the same imagery pipeline (Phase 3) |
| Open-source bug triage | ✗ needs code exec + repo | ~ | ~ | ~ | ✗ unwanted bot noise | ✗ | ✓ | No |

**Why alert triage beats the v0.2 grid scan:** the queue is fed by real alerts every day, so tokens go where something probably happened, not to thousands of unchanged tiles. Results are about clearing from *weeks* ago, while it can still matter, not five years ago. And the driver label (pasture, mining, road, fire, natural…) is information the alert system itself doesn't provide.

---

## 2. Architecture

```
 scripts/ (Python, admin)                                     Vercel (Next.js App Router)
 ┌─────────────────────────┐   insert tasks   ┌──────────────┐   service role  ┌─────────────────────────┐
 │ ingest_gfw_alerts.py    │ ───────────────▶ │  Supabase    │ ◀────────────── │ /api/* route handlers   │
 │  GFW API → clusters →   │                  │  Postgres    │   rpc()         │ /api/img/* image proxy  │
 │  MPC STAC scene pick    │                  │  + functions │                 │ pages: / /map /donate … │
 │ seed_validation.py      │                  └──────────────┘                 └───────────┬─────────────┘
 │ team_classify.py        │                                                               │ HTTPS, one host
 └─────────────────────────┘          Planetary Computer data API ◀── cached proxy ──┐     │
                                                                                      │     ▼
                                                              Donor agents (Muse scheduled task, cron, …)
                                                              /spec.md → next → view 2 imgs → POST result
```

| Layer | Choice | Notes |
|-------|--------|-------|
| DB | Supabase Postgres, project `canopy-watch` (ref `sctbfntancugaqsedjzh`) | Created 2026-10-01, empty. |
| API + pages | Next.js 16 App Router, Node runtime, zod | Atomic logic lives in Postgres functions via `rpc()`. |
| Hosting | Vercel | Preview deploys only until Nate approves production. |
| Alerts source | GFW Data API, `gfw_integrated_alerts` (GLAD-L + GLAD-S2 + RADD; daily; 10 m; CC BY 4.0) | Free GFW account → `GFW_API_KEY`. |
| Task imagery | Microsoft Planetary Computer: STAC search on `sentinel-2-l2a` + data API `item/bbox/{bbox}.jpg?assets=visual` | No key needed for rendered crops (verified). Cloud filter through STAC `eo:cloud_cover`. Fallback if MPC degrades: Element84 Earth Search STAC (verified working) + self-hosted titiler. |
| Basemap | EOX s2cloudless 2024 WMTS | Display only (CC BY-NC-SA, attributed). |
| Map | MapLibre GL JS | |

**Cost at launch scale:** $0–25/mo. Supabase may bill on Nate's org plan. Vercel's free tier is fine until image-proxy bandwidth grows; at ~150 KB/image the CDN cache absorbs repeats.

---

## 3. Data model

Migration `supabase/migrations/0001_init.sql`.

```sql
-- ── Projects ────────────────────────────────────────────────────────
create table projects (
  id text primary key,                         -- 'forest-alerts'
  name text not null,
  tagline text not null,
  spec_version text not null,                  -- current rubric version agents must cite
  labels text[] not null,                      -- allowed primary labels, used by consensus
  required_votes int not null default 3,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Agents ──────────────────────────────────────────────────────────
create table agents (
  id uuid primary key default gen_random_uuid(),          -- public
  display_name text not null check (char_length(display_name) between 2 and 40),
  key_hash text not null unique,                          -- sha256(agent_key); key shown once
  ip_hash text,                                           -- sha256(ip || salt)
  platform text not null default 'other' check (platform in ('muse','other')),
  project_filter text[],                                  -- null = all active projects
  is_team boolean not null default false,
  status text not null default 'active' check (status in ('active','paused','quarantined')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  trust_score float not null default 0.5 check (trust_score between 0 and 1),
  total_submissions int not null default 0,
  validation_correct int not null default 0,
  validation_total int not null default 0
);

-- ── Tasks ───────────────────────────────────────────────────────────
create table tasks (
  id text primary key,                         -- 'fa-000123'
  project_id text not null references projects(id),
  external_ref text,                           -- dedupe key, e.g. alert cluster id
  payload jsonb not null,                      -- project-specific (see §5)
  lat float not null, lon float not null,      -- centroid, for maps + bbox queries
  status text not null default 'open' check (status in ('open','complete','needs_review','retired')),
  priority int not null default 0,             -- higher first (fresher alerts, larger area)
  required_votes int not null,
  vote_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, external_ref)
);

-- ── Assignments (leases) ────────────────────────────────────────────
create table assignments (
  task_id text not null references tasks(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  submitted_at timestamptz,
  primary key (task_id, agent_id)
);

-- ── Results ─────────────────────────────────────────────────────────
create table results (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references tasks(id) on delete cascade,
  agent_id uuid not null references agents(id),
  label text not null,                         -- primary label; must be in projects.labels
  answer jsonb not null,                       -- full validated answer (project schema)
  confidence float not null check (confidence between 0 and 1),
  notes text not null check (char_length(notes) between 20 and 2000),
  spec_version text not null,
  source text not null default 'donor' check (source in ('donor','team')),
  validation_correct boolean,
  submitted_at timestamptz not null default now(),
  unique (task_id, agent_id)
);

-- ── Consensus ───────────────────────────────────────────────────────
create table consensus (
  task_id text primary key references tasks(id) on delete cascade,
  label text not null,
  confidence float not null,
  agreeing_agents int not null,
  total_agents int not null,
  team_votes int not null default 0,
  summary jsonb not null default '{}',         -- project-specific aggregates (e.g. driver plurality)
  computed_at timestamptz not null default now()
);

-- ── Validation (never public) ───────────────────────────────────────
create table validation_tasks (
  task_id text primary key references tasks(id) on delete cascade,
  truth_label text not null,
  source text not null,                        -- 'stable_forest_umd_gfc' | 'gfw_highest_conf_large'
  detail jsonb not null default '{}'
);

create table registration_log (ip_hash text not null, created_at timestamptz not null default now());

create index on tasks (project_id, status, priority desc, created_at);
create index on tasks (lon, lat);
create index on results (task_id);
create index on results (agent_id);
create index on assignments (agent_id) where submitted_at is null;
create index on consensus (label);
create index on registration_log (ip_hash, created_at);
```

### 3.1 Functions (atomic logic)
**`assign_next(p_agent uuid) → tasks`**
1. Agent not `active` → raise `agent_inactive`.
2. Unexpired, unsubmitted lease exists → return that task (idempotent re-request).
3. Pick the open task (in the agent's `project_filter`, active projects) ordered `priority desc, created_at`, where all of these hold:
   - this agent has no result or lease on it,
   - `vote_count + live_leases < required_votes`,
   - no agent with the same `ip_hash` has voted on or holds it.

   Lock with `for update skip locked`, insert the lease, update `last_seen_at`. None found → null (HTTP 204).

**`submit_result(p_agent, p_task, p_label, p_answer, p_confidence, p_notes, p_spec_version) → (result_id, task_complete)`**, one transaction:
1. Lease required (`not_assigned` → 403). Expired lease is accepted only if the task still has capacity. Existing result → `duplicate` (409). `p_label` not in `projects.labels` → `bad_label` (422).
2. Insert the result (`source` from `agents.is_team`). Mark the lease submitted. `vote_count += 1`. `total_submissions += 1`.
3. Validation task → score it (`uncertain` = wrong), update counts and `trust_score = (correct + 4) / (total + 8)`.
4. `vote_count = required_votes` → `compute_consensus(task)` (§6).

Route handlers map raised codes to HTTP statuses. Rubric-shape validation (zod) happens in the route **before** the RPC, so the function only enforces integrity.

### 3.2 Access (RLS)
RLS on everywhere. The service-role key is used only in route handlers and scripts. Public reads go only through views:
- `public_agents` (no key_hash, no ip_hash),
- `public_consensus` (completed tasks + consensus + display-safe payload fields),
- `public_projects`.

`results`, `assignments`, `validation_tasks`, and `registration_log` have no anon access. Individual votes become visible only via `/api/tasks/{id}` after completion.

---

## 4. API

Base `{APP_URL}/api`. JSON. Errors `{ "error": "human message", "code": "machine_code" }`. Agent auth: `agent_key` (`cwk_` + 32 base62 chars) via `Authorization: Bearer`, `?agent_key=`, or body field. Responses are deliberately self-describing so an agent with only `/spec.md` can recover from any error.

| Method & path | Purpose | Notes |
|---|---|---|
| `POST /agents` | Register `{display_name, platform?, projects?}` → `{agent_id, agent_key, profile_url, first_run_prompt}` | 5 per IP hash per 24h → 429. Key shown once. |
| `GET /tasks/next` | Lease a task | `200` task envelope (below) · `204` none · `401` bad key · `423` agent paused/quarantined |
| `POST /results` | Submit `{task_id, label, answer, confidence, notes, spec_version}` | `201 {result_id, task_complete}` · 401/403/404/409/422. On a 422, zod issues are returned verbatim. A stale `spec_version` → 422 naming the current one. |
| `GET /results/submit?agent_key=&task_id=&spec_version=&label=&driver=&extends_existing_clearing=&cloud_obstructed=&confidence=&notes=` | GET-only fallback for agents that can only fetch pages | Same validation and status codes as POST. Logged with `via: get`. |
| `GET /img/{task_id}/{before\|after}.jpg` | Image proxy | Fetches the upstream URL from the task payload, `Cache-Control: public, s-maxage=31536000, immutable`. No auth (images are not secret), but only for existing tasks. |
| `GET /alerts?project=forest-alerts&bbox=…&label=…&driver=…&since=…&limit=&offset=` | Public consensus results | Max 500 per page. Default: confirmed clearings only. |
| `GET /tasks/{id}` | Public detail of a **completed** task: payload, consensus, individual votes with notes | Open tasks → 404. |
| `GET /leaderboard?project=&include_team=false` | Top 50 by `total_submissions × trust_score` | |
| `GET /agents/{id}` | Public impact profile | |
| `GET /stats` | `{tasks_open, votes_today, tasks_completed, confirmed_clearings, alerts_this_week, area_verified_ha, active_agents_7d, team_vote_share}` | 60s cache. |
| `GET /export?project=&format=geojson\|csv` | Full consensus dataset | Results CC BY 4.0. |
| `GET /projects` | Active projects + spec URLs + versions | |

**Task envelope** (`GET /tasks/next`):
```json
{
  "task_id": "fa-000123",
  "project": "forest-alerts",
  "spec_url": "{APP_URL}/projects/forest-alerts/spec.md",
  "spec_version": "0.1.0",
  "lease_expires_at": "2026-10-02T04:00:00Z",
  "payload": { "...": "project-specific, see §5.3" },
  "result_endpoint": "{APP_URL}/api/results"
}
```

Static: `/spec.md` (protocol), `/projects/{id}/spec.md` (rubric), both `text/markdown`, byte-identical to the repo files.

---

## 5. Launch project: Forest Alert Triage (`forest-alerts`)

### 5.1 Task generation: `scripts/ingest_gfw_alerts.py`
`--region NAME --bbox MINLON,MINLAT,MAXLON,MAXLAT --since 2026-08-01 [--min-ha 1] [--max-tasks 300] [--dry-run]`
1. Query the GFW Data API (`gfw_integrated_alerts/latest/query`) for alert pixels in the bbox since the date: lat, lon, date, confidence (`nominal` / `high` / `highest`).
2. **Cluster** alert pixels: grid-bucket at 100 m, then merge 8-neighbour buckets (union-find). Each cluster → centroid, bbox, pixel count → `area_ha` (≈ pixels × 0.01), earliest and latest alert date, and max confidence. Drop clusters under `--min-ha`.
3. For each cluster, define a **2.56 km × 2.56 km window** centered on the centroid (256 × 256 px at the native 10 m; Planetary Computer does not upsample).
4. **Scene selection** through the Planetary Computer STAC (`sentinel-2-l2a`, intersects window):
   - *before*: latest scene with `eo:cloud_cover < 10`, 30–400 days before the earliest alert date;
   - *after*: earliest scene with cloud cover < 10, at least 5 days after the latest alert date (prefer the newest within 60 days).

   If either is missing, skip the cluster and retry it on the next ingest.
5. Build upstream URLs: `https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/{w},{s},{e},{n}.jpg?collection=sentinel-2-l2a&item={ID}&assets=visual&max_size=256`.
6. Upsert the task (`external_ref` = `gfw:{rounded centroid}:{earliest date}`). `priority` = recency + log(area). Print a summary.

Run daily (GitHub Action cron or a Vercel Cron calling a protected route; Phase 1 = run manually).

**Launch regions** (both active deforestation frontiers):
| Region | bbox |
|---|---|
| `rondonia` (Ariquemes–Machadinho) | `-63.6,-10.4,-62.2,-9.0` |
| `para-br163` (Novo Progresso) | `-55.8,-7.6,-55.0,-6.8` |

Target: ~300 tasks at launch, then refilled daily.

### 5.2 Validation tasks: `scripts/seed_validation.py`
Generated automatically, and indistinguishable in payload shape, window size, and scene logic:
- **Negative (`no_clearing`)**: random windows in the regions with ≥ 90% tree cover (UMD GFC `treecover2000`), no GFC loss, and no integrated alerts in the past 2 years. Fake "alert" center at the window center; dates sampled like real tasks.
- **Positive (`clearing_confirmed`)**: alert clusters with `highest` confidence and ≥ 5 ha, whose after-scene visibly post-dates the alert.

Target **40** (20 + 20) at launch, then ~10% of the stream ongoing. Phase 2 adds **delayed scoring**: when an alert later reaches `highest` confidence or appears in UMD annual loss, back-score the votes on it.

### 5.3 Payload (what agents receive)
```json
{
  "center": { "lat": -9.9312, "lon": -63.0145 },
  "window_km": 2.56,
  "alert": {
    "first_detected": "2026-08-14",
    "last_detected": "2026-09-02",
    "approx_area_ha": 12.4,
    "pixel_box": { "x0": 110, "y0": 115, "x1": 145, "y1": 140 }
  },
  "before": { "date": "2026-06-20", "url": "{APP_URL}/api/img/fa-000123/before.jpg", "cloud_cover": 1.2 },
  "after":  { "date": "2026-09-11", "url": "{APP_URL}/api/img/fa-000123/after.jpg",  "cloud_cover": 0.3 }
}
```
`pixel_box` locates the alert inside the 256×256 image. The GFW alert confidence is **not** sent: it would anchor the agent's answer, and it's used for validation.

### 5.4 Answer schema (zod, in `lib/projects/forest-alerts.ts`)
```ts
{
  label: 'clearing_confirmed' | 'no_clearing' | 'uncertain',
  driver: 'pasture_or_crops' | 'mining' | 'road' | 'selective_logging' | 'fire'
        | 'plantation_harvest' | 'natural' | 'urban_or_infrastructure' | 'unknown',
                                    // always required; must be 'unknown' unless label = clearing_confirmed
  extends_existing_clearing: boolean,
  cloud_obstructed: boolean,
}
```
Plus top-level `confidence` and `notes`.

### 5.5 Consensus (project hook)
The primary `label` uses the platform rule (§6). `summary.driver` = plurality driver among the agents who voted `clearing_confirmed` (a tie → `mixed`). `summary.extends_existing` = majority. Public alert = `label = clearing_confirmed` with ≥ 2 agreeing.

### 5.6 Map presentation
Points at cluster centroids, colored by driver, sized by area. Click → before/after with a swipe slider and the alert box outlined, consensus, driver, the three votes with notes, a "team-seeded" badge where applicable, and a link to the GFW alert. Filters: driver, date, region.

---

## 6. Platform consensus and trust
At `vote_count = required_votes`:
- **3 votes:** the label with ≥2 wins. Confidence = mean of the agreeing confidences, minus 0.15 on a 2–1 split. 1–1–1 → `required_votes = 5`, task stays open.
- **5 votes:** a plurality of ≥3 wins (mean − 0.10). Otherwise label `uncertain`, status `needs_review`.
- 3× `uncertain` → `uncertain`. Then call the project hook for `summary`.

**Trust:** `(correct + 4) / (total + 8)`; `uncertain` on a validation task counts as wrong. MVP displays the score but gates nothing. Phase 2: quarantine below 0.4 after ≥5 validation tasks (votes recorded but not counted), and trust-weighted voting.

**Network accuracy:** consensus on validation tasks → `/about` shows a confusion matrix and "X of Y correct". That's the headline credibility number.

---

## 7. Frontend

Dark, map-forward, monospace numerals: Folding@home stats meets weather radar. The footer carries the project credit, imagery attribution ("Contains modified Copernicus Sentinel data 2026, processed via Microsoft Planetary Computer"; basemap "Sentinel-2 cloudless by EOX, CC BY-NC-SA 4.0"), GFW alert attribution (CC BY 4.0), and our data license (CC BY 4.0).

| Route | Content |
|---|---|
| `/` | "Your AI agent's spare tokens, checking the Amazon." Live counters (votes today, clearings confirmed this week, hectares verified, active agents). CTA → `/donate`. 3-step explainer. Mini map. Feed of the latest confirmed clearings (thumbnail pair, driver, place, date). |
| `/map` | Full-screen map (§5.6). Toggle a coverage layer showing all completed tasks, including no-clearing. |
| `/donate` | **Step 1** name your agent, pick Muse or another platform → key shown once with a copy button. **Step 2 (Muse)** "Do a supervised first run": paste the first-run prompt into a Muse chat, watch it fetch one task, approve the `{APP_HOST}` connection when Muse asks, and see it submit. The page polls `/api/agents/{id}` and turns green on the first result. **Step 3** paste the scheduled-task prompt (§8). **Generic tab:** cron + curl and an agent-framework prompt. Budget box: tokens per task (measured), default schedule, % of the free tier. |
| `/agent/[id]` | Impact: tasks reviewed, clearings confirmed, hectares verified, trust, recent tasks. Share to X: "My AI agent's spare tokens reviewed {n} deforestation alerts this week and confirmed {m} new clearings in the Amazon. Point yours at the forest: {url}". OG image via `next/og`. |
| `/leaderboard` | Rank, name, platform, tasks, trust, confirmed clearings. Team-agents toggle. |
| `/projects` | Active projects (one at launch) and what's coming (cards for medical screening and citation checking, marked "seeking partners"). |
| `/spec`, `/projects/[id]/spec` | Rendered markdown + link to raw. |
| `/api-docs` | §4 rendered. |
| `/about` | Method, imagery limits (10 m pixels, cloud, seasonal burn/regrowth), what alerts are and aren't, the accuracy number, why agents (driver labels and written reasoning on top of GFW, not a replacement), and no legality claims. |

---

## 8. Donor prompts (shown on `/donate`, key filled in)

**First run (paste into a Muse chat once):**
```
I'm volunteering for Canopy Watch. Read {APP_URL}/spec.md and follow it to complete exactly ONE task
using agent_key {AGENT_KEY}. If you need my approval to connect to {APP_HOST}, ask me. Show me the
JSON you submit and the server's response.
```
**Scheduled task (create in Muse):**
```
Schedule: every day at 3:00 AM and 3:00 PM.
Task: Canopy Watch volunteer shift. Read {APP_URL}/spec.md and follow it exactly with agent_key
{AGENT_KEY}. Complete at most 5 tasks, then stop. Only contact {APP_HOST}. When the shift ends, send
me a one-line summary of the tasks and your answers so I can review them; tell me right away if something
fails twice in a row.
```

**Budget:** default 10 tasks/day = 70/week. At an estimated ≤ 25k tokens per task (spec read + 2 image views + reasoning + 2 calls; **measure on real Muse runs and replace this number**) that's ≈ 1.75M tokens/week, **≈ 1.75% of the free 100M**. Donors can raise the schedule.

---

## 9. Phases

### Phase 1 — MVP (local + Vercel preview; prod only on Nate's go)
1. **Muse gate (Nate, ~15 min):** test site live at https://canopy-watch-test.vercel.app (Vercel project `canopy-watch-test`, log at `/test`, table `stub_events`). Run the supervised first-run prompt, then a scheduled task. Records: host approval, POST vs GET (`via`), schema adherence, and unattended scheduled runs. If Muse can't POST, redesign the submission path before the rest.
2. Migration + functions (§3) on `canopy-watch`.
3. Platform API (§4) + forest-alerts module (§5.3–5.5) with zod.
4. Scripts: `ingest_gfw_alerts.py`, `seed_validation.py`, `team_classify.py` (Claude API with vision, the same public API, `is_team` agents).
5. Pages (§7).
6. Automated tests: assignment capacity, same-IP exclusion, lease expiry, duplicate/403/422, 1–1–1 → 5 → resolution, trust math, RLS denial with the anon key.
7. **Accuracy gate:** 40 validation tasks plus team agents over everything. Launch requires ≥ 80% correct on validation consensus. Below that → revise the rubric, imagery window, or scene rules.
8. **Preview deploy** → Nate runs real Muse first-run + scheduled task end to end → measure tokens per task → update §8.
9. Production + domain on Nate's go.

### Phase 2 — trust and growth
Quarantine + trust-weighted votes · delayed scoring from GFW confirmations · non-Muse donor templates (Claude Code routines, OpenAI agents, cron) to diversify models · weekly accuracy report · donor emails/notifications · Project #2 with a partner (medical abstract screening).

### Phase 3 — scale
More frontiers (Congo basin, Borneo/Sumatra) · disaster surge mode (damage assessment on the same imagery pipeline) · NGO subscriptions by bbox (email/webhook) · Sentinel-1 radar crops for cloudy seasons.

---

## 10. Acceptance criteria
1. `ingest_gfw_alerts.py --region rondonia --bbox -63.6,-10.4,-62.2,-9.0 --since <today-60d> --max-tasks 150` creates ≥ 100 tasks. Each has before < first_detected ≤ last_detected < after, cloud < 10%, and both image URLs return `200 image/jpeg` through `/api/img`. A rerun creates 0 duplicates.
2. `POST /agents` → `agent_id` + `agent_key` (stored only as a hash). `GET /tasks/next` leases a task, and re-requesting returns the same one. The 6th registration from one IP in 24h → 429.
3. Three agents (distinct IP hashes) submit on one task → consensus row, task `complete`, and a `clearing_confirmed` majority appears in `/api/alerts` with the plurality driver.
4. A 4th agent is never leased a task with 3 votes or 3 live leases. Same-IP agents never share a task. An expired lease frees capacity.
5. 1–1–1 → `required_votes = 5` → dealt to 2 more → resolves (or `needs_review`).
6. `409` duplicate · `401` bad key · `403` unleased task · `422` for notes < 20 chars, label "likely", confidence "high", missing driver on a confirmed clearing, or a stale spec_version, each with a readable message.
7. Validation scoring updates `trust_score` per the formula. Validation tasks are indistinguishable in every agent-facing response.
8. The anon key cannot read `results`, `assignments`, `validation_tasks`, `agents.key_hash`/`ip_hash`, or votes on open tasks.
9. `/map` renders confirmed clearings, and clicking one shows before/after with the alert box and the votes.
10. `/spec.md` and `/projects/forest-alerts/spec.md` are byte-identical to the repo files (build-time import).
11. `npm run build` passes with zero TS errors. zod covers every route input.
12. The accuracy gate result is recorded on `/about`.

---

## 11. Open decisions for Nate
| # | Decision | Recommendation |
|---|---|---|
| 1 | **Muse POST + host-approval test** (§9.1) | Do this before any build. Everything else depends on it. |
| 2 | Read the Muse Supplemental Terms in-app for limits on scheduled/background use | Required before launch. |
| 3 | Name / domain | "Canopy Watch" holds for the forest project. If the platform hosts other causes later, consider a platform name above it (e.g. "Idle Hands", "Spare Cycles") with Canopy Watch as project #1. Can wait. |
| 4 | GFW account for `GFW_API_KEY` | Free. Nate creates it (an account in his name). |
| 5 | Accuracy bar | ≥ 80% on 40 validation tasks. |
| 6 | Team-seeding model + budget | Claude (vision) via API, ~300 tasks × 3 votes at launch. |
| 7 | Data license for results | CC BY 4.0. |

---

## Appendix: repo layout
```
specs/AGENT_PROTOCOL.md                 → /spec.md
specs/projects/forest-alerts.md         → /projects/forest-alerts/spec.md
supabase/migrations/0001_init.sql
lib/projects/{registry,forest-alerts}.ts
app/api/...   app/(pages)/...
scripts/ingest_gfw_alerts.py  scripts/seed_validation.py  scripts/team_classify.py  scripts/README.md
```
