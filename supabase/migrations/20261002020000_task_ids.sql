-- Sequential task IDs ('fa-000123') assigned by the database, so ingest scripts can insert in bulk
-- and skip duplicates (unique project_id + external_ref) without coordinating IDs.
alter table tasks alter column id set default 'fa-' || lpad(nextval('task_seq')::text, 6, '0');
