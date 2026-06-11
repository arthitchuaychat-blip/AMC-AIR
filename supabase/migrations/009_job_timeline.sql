-- Job timeline: append-only log of status changes + photo/comment updates (unlimited entries)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
create table if not exists job_logs (
  id         bigint generated always as identity primary key,
  job_no     text not null references job_orders(job_no) on delete cascade,
  type       text not null default 'update' check (type in ('update','status')),
  status     text,
  note       text,
  photos     text[] default '{}',
  author     text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists idx_job_logs_job on job_logs(job_no, created_at);

alter table job_logs enable row level security;
create policy jl_read on job_logs for select to authenticated using (true);
create policy jl_insert on job_logs for insert to authenticated with check (
  my_role() in ('admin','sales')
  or (my_role() = 'tech' and exists (select 1 from job_orders j where j.job_no = job_logs.job_no and j.assigned_team = my_team()))
);
