-- Donors can leave: their agent is deactivated, its key invalidated and its public name
-- anonymised. Votes stay in the open dataset (they're part of published verdicts) but no longer
-- carry the person's chosen name.
create or replace function leave_agent(p_key_hash text)
returns uuid language plpgsql as $$
declare
  aid uuid;
begin
  update agents
     set status = 'paused',
         display_name = 'Former volunteer',
         key_hash = 'left:' || gen_random_uuid()::text,
         ip_hash = null,
         project_filter = null
   where key_hash = p_key_hash
  returning id into aid;
  if aid is null then raise exception 'bad_key'; end if;
  -- Release any unanswered leases so the tasks go back to the queue.
  delete from assignments where agent_id = aid and submitted_at is null;
  return aid;
end $$;

revoke execute on function leave_agent(text) from public, anon, authenticated;

-- Former volunteers drop off the leaderboard.
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
  where a.total_submissions > 0 and (p_include_team or not a.is_team) and a.status = 'active'
  order by a.total_submissions * a.trust_score desc, a.created_at
  limit least(p_limit, 50);
$$;
