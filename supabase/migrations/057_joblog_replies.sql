-- 057_joblog_replies.sql — threaded replies on the job timeline.
-- A reply is a normal 'update' log row with parent_id pointing at the comment it replies to.

alter table job_logs add column if not exists parent_id bigint references job_logs(id) on delete cascade;
create index if not exists idx_job_logs_parent on job_logs(parent_id);
