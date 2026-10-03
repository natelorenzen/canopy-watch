-- Canopy Watch core schema (BUILD_SPEC.md §3).
--
-- Access model: every table has RLS enabled and NO policies, so the anon/authenticated keys can't
-- read or write them directly. All reads and writes go through Next.js route handlers using the
-- service-role key. Open data is exposed to anon only through the public_* views at the bottom,
-- which select safe columns (never key_hash, ip_hash, validation truth, or votes on open tasks).
-- Functions that mutate state are revoked from anon/authenticated.

-- ── Projects ────────────────────────────────────────────────────────
create table projects (
  id text primary key,
  name text not null,
  tagline text not null,
  spec_version text not null,
  labels text[] not null,
  required_votes int not null default 3,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Agents ──────────────────────────────────────────────────────────
create table agents (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 40),
  key_hash text not null unique,
  ip_hash text,
  platform text not null default 'other' check (platform in ('muse','other')),
  project_filter text[],
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
  id text primary key,
  project_id text not null references projects(id),
  external_ref text,
  payload jsonb not null,
  lat float not null,
  lon float not null,
  region text,
  area_ha float,
  status text not null default 'open' check (status in ('open','complete','needs_review','retired')),
  priority int not null default 0,
  required_votes int not null,
  vote_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, external_ref)
);

create sequence task_seq;

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
  agent_id uuid not null references agents(id) on delete cascade,
  label text not null,
  answer jsonb not null,
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
  summary jsonb not null default '{}',
  computed_at timestamptz not null default now()
);

-- ── Validation (never public) ───────────────────────────────────────
create table validation_tasks (
  task_id text primary key references tasks(id) on delete cascade,
  truth_label text not null,
  source text not null,
  detail jsonb not null default '{}'
);

create table registration_log (
  ip_hash text not null,
  created_at timestamptz not null default now()
);

create index on tasks (project_id, status, priority desc, created_at);
create index on tasks (lon, lat);
create index on results (task_id);
create index on results (agent_id);
create index on assignments (agent_id) where submitted_at is null;
create index on consensus (label);
create index on consensus (computed_at desc);
create index on registration_log (ip_hash, created_at);

alter table projects enable row level security;
alter table agents enable row level security;
alter table tasks enable row level security;
alter table assignments enable row level security;
alter table results enable row level security;
alter table consensus enable row level security;
alter table validation_tasks enable row level security;
alter table registration_log enable row level security;

-- ── Seed: launch project ────────────────────────────────────────────
insert into projects (id, name, tagline, spec_version, labels, required_votes) values (
  'forest-alerts',
  'Forest Alert Triage',
  'Check fresh deforestation alerts against satellite imagery: is the clearing real, and what caused it?',
  '0.1.0',
  array['clearing_confirmed','no_clearing','uncertain'],
  3
);

-- ════════════════════════════════════════════════════════════════════
-- Functions. Errors are raised with a stable machine code as the message; the API maps codes to
-- HTTP statuses (lib/db.ts).
-- ════════════════════════════════════════════════════════════════════

create or replace function register_agent(p_name text, p_key_hash text, p_ip_hash text, p_platform text)
returns uuid language plpgsql as $$
declare
  new_id uuid;
begin
  if p_ip_hash is not null and (
    select count(*) from registration_log
    where ip_hash = p_ip_hash and created_at > now() - interval '24 hours'
  ) >= 5 then
    raise exception 'rate_limited';
  end if;
  if p_ip_hash is not null then
    insert into registration_log (ip_hash) values (p_ip_hash);
  end if;
  insert into agents (display_name, key_hash, ip_hash, platform)
  values (p_name, p_key_hash, p_ip_hash, coalesce(p_platform, 'other'))
  returning id into new_id;
  return new_id;
end $$;

-- Lease the next task for an agent. Returns zero rows when there's no work.
create or replace function assign_next(p_key_hash text)
returns setof tasks language plpgsql as $$
declare
  a agents;
  t tasks;
begin
  select * into a from agents where key_hash = p_key_hash;
  if not found then raise exception 'bad_key'; end if;
  if a.status <> 'active' then raise exception 'agent_inactive'; end if;

  update agents set last_seen_at = now() where id = a.id;

  -- Idempotent re-request: hand back an unexpired, unsubmitted lease.
  select tk.* into t
  from assignments s join tasks tk on tk.id = s.task_id
  where s.agent_id = a.id and s.submitted_at is null and s.expires_at > now() and tk.status = 'open'
  order by s.assigned_at
  limit 1;
  if found then
    return next t;
    return;
  end if;

  select tk.* into t
  from tasks tk
  join projects p on p.id = tk.project_id and p.active
  where tk.status = 'open'
    and (a.project_filter is null or tk.project_id = any (a.project_filter))
    -- never the same task twice for one agent (covers results too: every result has a lease)
    and not exists (select 1 from assignments s where s.task_id = tk.id and s.agent_id = a.id)
    -- capacity: submitted votes + live leases must leave room
    and tk.vote_count + (
      select count(*) from assignments s
      where s.task_id = tk.id and s.submitted_at is null and s.expires_at > now()
    ) < tk.required_votes
    -- anti-sybil: agents registered from the same IP never share a task
    and (a.ip_hash is null or not exists (
      select 1 from assignments s join agents o on o.id = s.agent_id
      where s.task_id = tk.id and o.ip_hash = a.ip_hash
    ))
  order by tk.priority desc, tk.created_at
  limit 1
  for update of tk skip locked;

  if not found then return; end if;

  insert into assignments (task_id, agent_id) values (t.id, a.id);
  return next t;
end $$;

-- Consensus at vote_count = required_votes (BUILD_SPEC §6).
create or replace function compute_consensus(p_task text)
returns void language plpgsql as $$
declare
  t tasks;
  n int;
  team int;
  counts int[];
  top_label text;
  top_mean float;
  winner text;
  conf float;
  agreeing int;
  new_status text := 'complete';
  summ jsonb := '{}';
  d1 record;
  d2 record;
  ext_yes int;
begin
  select * into t from tasks where id = p_task for update;
  select count(*), count(*) filter (where source = 'team') into n, team from results where task_id = p_task;
  select array_agg(c order by c desc) into counts
  from (select count(*)::int c from results where task_id = p_task group by label) z;
  select label, avg(confidence) into top_label, top_mean
  from results where task_id = p_task
  group by label order by count(*) desc, avg(confidence) desc limit 1;

  if counts[1] >= n / 2 + 1 then
    winner := top_label;
    agreeing := counts[1];
    conf := top_mean - case
      when counts[1] = n then 0
      when n <= 3 then 0.15
      else 0.10 end;
  elsif n < 5 then
    -- 1–1–1 split: reopen for two more reviewers.
    update tasks set required_votes = 5 where id = p_task;
    return;
  else
    winner := 'uncertain';
    agreeing := coalesce((select count(*) from results where task_id = p_task and label = 'uncertain'), 0);
    conf := 0;
    new_status := 'needs_review';
  end if;

  -- Project hook: forest-alerts aggregates driver + extends_existing among confirming voters.
  if t.project_id = 'forest-alerts' and winner = 'clearing_confirmed' then
    select answer->>'driver' as d, count(*) as c into d1
    from results where task_id = p_task and label = 'clearing_confirmed'
    group by 1 order by 2 desc, 1 limit 1;
    select answer->>'driver' as d, count(*) as c into d2
    from results where task_id = p_task and label = 'clearing_confirmed'
    group by 1 order by 2 desc, 1 offset 1 limit 1;
    select count(*) filter (where (answer->>'extends_existing_clearing')::boolean) into ext_yes
    from results where task_id = p_task and label = 'clearing_confirmed';
    summ := jsonb_build_object(
      'driver', case when d2.c is not null and d2.c = d1.c then 'mixed' else d1.d end,
      'extends_existing', ext_yes * 2 > agreeing
    );
  end if;

  insert into consensus (task_id, label, confidence, agreeing_agents, total_agents, team_votes, summary)
  values (p_task, winner, greatest(conf, 0), agreeing, n, team, summ)
  on conflict (task_id) do update set
    label = excluded.label, confidence = excluded.confidence, agreeing_agents = excluded.agreeing_agents,
    total_agents = excluded.total_agents, team_votes = excluded.team_votes, summary = excluded.summary,
    computed_at = now();

  update tasks set status = new_status where id = p_task;
end $$;

-- Submit one answer, atomically: lease check, insert, counters, validation scoring, consensus.
create or replace function submit_result(
  p_key_hash text, p_task text, p_label text, p_answer jsonb, p_confidence float, p_notes text, p_spec_version text,
  out result_id uuid, out task_complete boolean
) language plpgsql as $$
declare
  a agents;
  t tasks;
  pr projects;
  s assignments;
  v validation_tasks;
  live int;
  ok boolean;
begin
  select * into a from agents where key_hash = p_key_hash;
  if not found then raise exception 'bad_key'; end if;
  if a.status <> 'active' then raise exception 'agent_inactive'; end if;

  select * into t from tasks where id = p_task for update;
  if not found then raise exception 'unknown_task'; end if;
  select * into pr from projects where id = t.project_id;
  if p_spec_version <> pr.spec_version then raise exception 'stale_spec'; end if;
  if not (p_label = any (pr.labels)) then raise exception 'bad_label'; end if;
  if exists (select 1 from results r where r.task_id = p_task and r.agent_id = a.id) then
    raise exception 'duplicate';
  end if;

  select * into s from assignments where task_id = p_task and agent_id = a.id;
  if not found then raise exception 'not_assigned'; end if;
  if t.status <> 'open' then raise exception 'task_closed'; end if;
  if s.expires_at <= now() then
    -- Late answers are fine as long as nobody else took the slot.
    select count(*) into live from assignments x
    where x.task_id = p_task and x.agent_id <> a.id and x.submitted_at is null and x.expires_at > now();
    if t.vote_count + live >= t.required_votes then raise exception 'lease_expired'; end if;
  end if;

  insert into results (task_id, agent_id, label, answer, confidence, notes, spec_version, source)
  values (p_task, a.id, p_label, p_answer, p_confidence, p_notes, p_spec_version,
          case when a.is_team then 'team' else 'donor' end)
  returning id into result_id;

  update assignments set submitted_at = now() where task_id = p_task and agent_id = a.id;
  update tasks set vote_count = vote_count + 1 where id = p_task returning * into t;
  update agents set total_submissions = total_submissions + 1, last_seen_at = now() where id = a.id;

  select * into v from validation_tasks where task_id = p_task;
  if found then
    ok := (p_label = v.truth_label);  -- 'uncertain' never matches, so it counts as wrong
    update results set validation_correct = ok where id = result_id;
    -- RHS columns are pre-update values: Laplace-smoothed (correct + 4) / (total + 8).
    update agents set
      validation_total = validation_total + 1,
      validation_correct = validation_correct + ok::int,
      trust_score = (validation_correct + ok::int + 4)::float / (validation_total + 1 + 8)
    where id = a.id;
  end if;

  task_complete := false;
  if t.vote_count >= t.required_votes then
    perform compute_consensus(p_task);
    select status <> 'open' into task_complete from tasks where id = p_task;
  end if;
end $$;

create or replace function get_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tasks_open', (select count(*) from tasks where status = 'open'),
    'tasks_completed', (select count(*) from tasks where status in ('complete','needs_review')),
    'votes_total', (select count(*) from results),
    'votes_today', (select count(*) from results where submitted_at > date_trunc('day', now())),
    'confirmed_clearings', (select count(*) from consensus where label = 'clearing_confirmed' and agreeing_agents >= 2),
    'alerts_this_week', (select count(*) from consensus where label = 'clearing_confirmed' and agreeing_agents >= 2
                          and computed_at > now() - interval '7 days'),
    'area_verified_ha', (select coalesce(round(sum(t.area_ha)::numeric, 1), 0) from consensus c join tasks t on t.id = c.task_id
                          where c.label = 'clearing_confirmed' and c.agreeing_agents >= 2),
    'active_agents_7d', (select count(distinct agent_id) from results where submitted_at > now() - interval '7 days'),
    'agents_total', (select count(*) from agents where not is_team),
    'team_vote_share', (select case when count(*) = 0 then 0
                          else round((count(*) filter (where source = 'team'))::numeric / count(*), 3) end from results)
  );
$$;

create or replace function get_leaderboard(p_include_team boolean default false, p_limit int default 50)
returns table (
  rank bigint, agent_id uuid, display_name text, platform text, is_team boolean,
  total_submissions int, trust_score float, validation_total int, confirmed_flags bigint
) language sql stable security definer set search_path = public as $$
  select row_number() over (order by a.total_submissions * a.trust_score desc, a.created_at),
         a.id, a.display_name, a.platform, a.is_team, a.total_submissions, a.trust_score, a.validation_total,
         (select count(*) from results r join consensus c on c.task_id = r.task_id
          where r.agent_id = a.id and r.label = 'clearing_confirmed'
            and c.label = 'clearing_confirmed' and c.agreeing_agents >= 2)
  from agents a
  where a.total_submissions > 0 and (p_include_team or not a.is_team) and a.status <> 'quarantined'
  order by a.total_submissions * a.trust_score desc, a.created_at
  limit least(p_limit, 50);
$$;

-- ── Public views (open data; safe columns only) ─────────────────────
create view public_agents as
  select id, display_name, platform, is_team, created_at, last_seen_at, trust_score, total_submissions, validation_total
  from agents where status <> 'quarantined';

create view public_consensus as
  select c.task_id, t.project_id, t.lat, t.lon, t.region, t.area_ha,
         c.label, c.confidence, c.agreeing_agents, c.total_agents, c.team_votes, c.summary, c.computed_at,
         t.payload->'alert' as alert,
         t.payload->'before'->>'date' as before_date,
         t.payload->'after'->>'date' as after_date
  from consensus c join tasks t on t.id = c.task_id;

grant select on public_agents, public_consensus to anon, authenticated;

revoke execute on function register_agent(text, text, text, text) from public, anon, authenticated;
revoke execute on function assign_next(text) from public, anon, authenticated;
revoke execute on function compute_consensus(text) from public, anon, authenticated;
revoke execute on function submit_result(text, text, text, jsonb, float, text, text) from public, anon, authenticated;
grant execute on function get_stats() to anon, authenticated;
grant execute on function get_leaderboard(boolean, int) to anon, authenticated;
