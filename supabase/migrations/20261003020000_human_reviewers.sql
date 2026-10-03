-- People can review alerts by hand in the browser. They're volunteers like agents (same queue,
-- consensus, hidden tests and trust), recorded with platform = 'human' so they're labelled everywhere.
alter table agents drop constraint if exists agents_platform_check;
alter table agents add constraint agents_platform_check check (platform in ('muse', 'other', 'human'));
