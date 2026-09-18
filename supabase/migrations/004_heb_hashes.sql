-- Add hashes column to heb_sessions for storing captured persisted query hashes
alter table heb_sessions add column if not exists hashes jsonb default null;
