-- Database-level acceptance tests for the core functions (BUILD_SPEC §10 items 2–8).
-- Run against a disposable database that has the migrations applied:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/core.sql
-- Everything runs in a transaction that is rolled back.

begin;

create function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'expected error % but statement succeeded: %', code, sql;
exception when others then
  if sqlerrm <> code then raise exception 'expected error %, got %', code, sqlerrm; end if;
end $$;

create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', what; end if;
  raise notice 'ok  %', what;
end $$;

create function pg_temp.mk_task(id text, prio int default 0) returns void language sql as $$
  insert into tasks (id, project_id, external_ref, payload, lat, lon, area_ha, required_votes, priority)
  values (id, 'forest-alerts', id, '{"alert":{}}', -9.5, -63.0, 5, 3, prio);
$$;

create function pg_temp.ans(driver text default 'unknown', ext boolean default false) returns jsonb language sql as $$
  select jsonb_build_object('driver', driver, 'extends_existing_clearing', ext, 'cloud_obstructed', false);
$$;

-- ── registration + rate limit ──
select register_agent('Alpha', 'kA', 'ip1', 'muse');
select register_agent('Bravo', 'kB', 'ip2', 'muse');
select register_agent('Charlie', 'kC', 'ip3', 'other');
select register_agent('Delta', 'kD', 'ip1', 'muse');          -- same IP as Alpha
select register_agent('Echo', 'kE', 'ip5', 'muse');
select register_agent('Foxtrot', 'kF', 'ip6', 'muse');
select register_agent('r3', 'kr3', 'ip1', 'muse');
select register_agent('r4', 'kr4', 'ip1', 'muse');
select register_agent('r5', 'kr5', 'ip1', 'muse');
select pg_temp.expect_error($$select register_agent('r6','kr6','ip1','muse')$$, 'rate_limited');
select pg_temp.check(true, '6th registration from one IP in 24h is rate limited');

select pg_temp.mk_task('T1', 10);
select pg_temp.mk_task('T2', 5);
select pg_temp.mk_task('T3', 1);

-- ── leasing ──
select pg_temp.expect_error($$select * from assign_next('nope')$$, 'bad_key');
select pg_temp.check((select id from assign_next('kA')) = 'T1', 'A leases highest-priority task T1');
select pg_temp.check((select id from assign_next('kA')) = 'T1', 're-request returns the same lease');
select pg_temp.check((select count(*) from assignments where agent_id = (select id from agents where key_hash='kA')) = 1, 'no double-assign');
select pg_temp.check((select id from assign_next('kB')) = 'T1', 'B leases T1');
select pg_temp.check((select id from assign_next('kD')) = 'T2', 'D (same IP as A) skips T1');
select pg_temp.check((select id from assign_next('kC')) = 'T1', 'C leases T1 (3rd slot)');
select pg_temp.check((select id from assign_next('kE')) = 'T2', 'E skips full T1');

-- ── submit validation ──
select pg_temp.expect_error($$select * from submit_result('kE','T1','no_clearing',pg_temp.ans(),0.5,'twenty characters of notes','0.1.0')$$, 'not_assigned');
select pg_temp.expect_error($$select * from submit_result('kA','T1','likely',pg_temp.ans(),0.5,'twenty characters of notes','0.1.0')$$, 'bad_label');
select pg_temp.expect_error($$select * from submit_result('kA','T1','no_clearing',pg_temp.ans(),0.5,'twenty characters of notes','0.0.9')$$, 'stale_spec');
select pg_temp.expect_error($$select * from submit_result('kA','TX','no_clearing',pg_temp.ans(),0.5,'twenty characters of notes','0.1.0')$$, 'unknown_task');

-- ── consensus 2–1 ──
select pg_temp.check((select not task_complete from submit_result('kA','T1','clearing_confirmed',pg_temp.ans('pasture_or_crops',true),0.9,'Rectangular block of canopy now bare soil.','0.1.0')), 'A submits, task not complete');
select pg_temp.expect_error($$select * from submit_result('kA','T1','no_clearing',pg_temp.ans(),0.5,'twenty characters of notes','0.1.0')$$, 'duplicate');
select * from submit_result('kB','T1','clearing_confirmed',pg_temp.ans('pasture_or_crops',false),0.7,'New clearing joined to pasture on the west.','0.1.0');
select pg_temp.check((select task_complete from submit_result('kC','T1','no_clearing',pg_temp.ans(),0.6,'Canopy looks intact; only haze differs.','0.1.0')), 'third vote completes T1');
select pg_temp.check((select label = 'clearing_confirmed' and agreeing_agents = 2 and total_agents = 3
                      and abs(confidence - (0.8 - 0.15)) < 1e-9 from consensus where task_id = 'T1'),
                     '2–1 majority wins with mean − 0.15');
select pg_temp.check((select summary->>'driver' = 'pasture_or_crops' and (summary->>'extends_existing')::boolean = false
                      from consensus where task_id = 'T1'), 'driver plurality + extends majority (1 of 2 is not a majority)');
select pg_temp.check((select status from tasks where id = 'T1') = 'complete', 'T1 status complete');
select pg_temp.expect_error($$select * from submit_result('kE','T1','no_clearing',pg_temp.ans(),0.5,'twenty characters of notes','0.1.0')$$, 'not_assigned');

-- ── 1–1–1 → reopen for 5 ──
select pg_temp.check((select id from assign_next('kB')) = 'T2', 'B leases T2');
select * from submit_result('kD','T2','clearing_confirmed',pg_temp.ans('mining'),0.8,'Bright pits and muddy ponds by the river.','0.1.0');
select * from submit_result('kE','T2','no_clearing',pg_temp.ans(),0.6,'Same canopy in both images, no change.','0.1.0');
select pg_temp.check((select not task_complete from submit_result('kB','T2','uncertain',pg_temp.ans(),0.3,'Haze covers most of the alert box.','0.1.0')), '1–1–1 does not complete');
select pg_temp.check((select required_votes = 5 and status = 'open' from tasks where id = 'T2'), '1–1–1 raises required_votes to 5');
select pg_temp.check((select id from assign_next('kC')) = 'T2', 'C gets reopened T2');
select pg_temp.check((select id from assign_next('kF')) = 'T2', 'F gets reopened T2');
select * from submit_result('kC','T2','clearing_confirmed',pg_temp.ans('mining'),0.7,'Mining pits along the stream, new since June.','0.1.0');
select pg_temp.check((select task_complete from submit_result('kF','T2','clearing_confirmed',pg_temp.ans('road'),0.9,'New clearing with a track cutting through it.','0.1.0')), '5th vote completes T2');
select pg_temp.check((select label = 'clearing_confirmed' and agreeing_agents = 3 and abs(confidence - (0.8 - 0.10)) < 1e-9
                      and summary->>'driver' = 'mining' from consensus where task_id = 'T2'), '3 of 5 wins with mean − 0.10, driver plurality mining');

-- ── validation scoring ──
insert into validation_tasks (task_id, truth_label, source) values ('T3', 'no_clearing', 'test');
select pg_temp.check((select id from assign_next('kA')) = 'T3', 'A leases validation task T3');
select * from submit_result('kA','T3','no_clearing',pg_temp.ans(),0.8,'Unbroken canopy in both images, no change.','0.1.0');
select pg_temp.check((select validation_total = 1 and validation_correct = 1 and abs(trust_score - 5.0/9) < 1e-9
                      from agents where key_hash = 'kA'), 'correct validation answer → trust (1+4)/(1+8)');
select pg_temp.check((select id from assign_next('kB')) = 'T3', 'B leases T3');
select * from submit_result('kB','T3','uncertain',pg_temp.ans(),0.3,'Cannot tell, haze over the alert box.','0.1.0');
select pg_temp.check((select validation_total = 1 and validation_correct = 0 and abs(trust_score - 4.0/9) < 1e-9
                      from agents where key_hash = 'kB'), 'uncertain on validation counts as wrong → 4/9');

-- ── lease expiry frees capacity ──
select pg_temp.mk_task('T4', 100);
select pg_temp.check((select id from assign_next('kC')) = 'T4', 'C leases T4');
select pg_temp.check((select id from assign_next('kE')) = 'T4', 'E leases T4');
select pg_temp.check((select id from assign_next('kF')) = 'T4', 'F leases T4');
select pg_temp.check((select count(*) from assign_next('kr3')) = 0, 'T4 full → no work (empty)');
update assignments set expires_at = now() - interval '1 minute' where task_id = 'T4' and agent_id = (select id from agents where key_hash = 'kC');
select pg_temp.check((select id from assign_next('kr3')) = 'T4', 'expired lease frees a slot');
select pg_temp.expect_error($$select * from submit_result('kC','T4','no_clearing',pg_temp.ans(),0.5,'twenty characters of notes','0.1.0')$$, 'lease_expired');

-- ── paused agents ──
update agents set status = 'paused' where key_hash = 'kr4';
select pg_temp.expect_error($$select * from assign_next('kr4')$$, 'agent_inactive');

-- ── public read surface ──
select pg_temp.check((select (get_stats()->>'confirmed_clearings')::int = 2), 'stats count 2 confirmed clearings');
select pg_temp.check((select count(*) from get_leaderboard(false, 50)) >= 5, 'leaderboard returns agents');
set local role anon;
select pg_temp.check((select count(*) from public_consensus) = 2, 'anon can read public_consensus');
select pg_temp.check((select (get_stats()->>'votes_total')::int = 10), 'anon can call get_stats (security definer)');
reset role;
do $$ begin
  set local role anon;
  if (select count(*) from results) > 0 then raise exception 'anon read results'; end if;
exception when insufficient_privilege then null;
end $$;
select pg_temp.check(true, 'anon cannot read results (no grant or RLS)');

rollback;
