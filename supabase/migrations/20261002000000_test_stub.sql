-- Test-site event log for the Muse capability test (BUILD_SPEC §9.1).
-- Written and read only by server routes using the service-role key; RLS on with no
-- policies means the anon key can't touch it. Drop once the real schema lands.
create table stub_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null,              -- spec | task | image | result
  method text not null,
  path text not null,
  status int not null,
  agent_key_prefix text,           -- first 12 chars only
  user_agent text,
  ip_hash text,
  body jsonb,
  errors jsonb
);
alter table stub_events enable row level security;
create index on stub_events (at desc);
