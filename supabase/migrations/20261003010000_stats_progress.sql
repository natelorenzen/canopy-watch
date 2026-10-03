-- Campaign progress for the leaderboard: how many alerts are in play, how many have verdicts, and how
-- many agent votes are still needed to finish the open ones. Retired tasks (bad imagery) don't count.
create or replace function get_stats()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tasks_open', (select count(*) from tasks where status = 'open'),
    'tasks_completed', (select count(*) from tasks where status in ('complete','needs_review')),
    'tasks_in_campaign', (select count(*) from tasks where status in ('open','complete','needs_review')),
    'votes_needed', (select coalesce(sum(greatest(required_votes - vote_count, 0)), 0) from tasks where status = 'open'),
    'votes_total', (select count(*) from results),
    'votes_today', (select count(*) from results where submitted_at > date_trunc('day', now())),
    'confirmed_clearings', (select count(*) from consensus where label = 'clearing_confirmed' and agreeing_agents >= 2),
    'alerts_this_week', (select count(*) from consensus where label = 'clearing_confirmed' and agreeing_agents >= 2
                          and computed_at > now() - interval '7 days'),
    'area_verified_ha', (select coalesce(round(sum(t.area_ha)::numeric, 1), 0) from consensus c join tasks t on t.id = c.task_id
                          where c.label = 'clearing_confirmed' and c.agreeing_agents >= 2),
    'active_agents_7d', (select count(distinct agent_id) from results where submitted_at > now() - interval '7 days'),
    'agents_total', (select count(*) from agents where not is_team and status = 'active'),
    'regions', (select count(distinct region) from tasks where status in ('open','complete','needs_review')),
    'team_vote_share', (select case when count(*) = 0 then 0
                          else round((count(*) filter (where source = 'team'))::numeric / count(*), 3) end from results)
  );
$$;
