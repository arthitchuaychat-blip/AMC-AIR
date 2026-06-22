-- 056_tasks.sql — internal task board (กระดานสั่งงาน): assigner → assignee, files, comments, status.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  detail text,
  assigner uuid references auth.users(id),     -- ผู้สั่งงาน (creator)
  assignee uuid references auth.users(id),      -- ผู้รับมอบหมาย
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'todo' check (status in ('todo','doing','done','cancelled')),
  due_date date,
  attachments text[] not null default '{}',     -- public file/image urls
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on tasks(assignee);
create index if not exists tasks_status_idx on tasks(status);
alter table tasks enable row level security;
drop policy if exists tasks_rw on tasks;
create policy tasks_rw on tasks for all to authenticated using (true) with check (true);

create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author uuid references auth.users(id),
  body text,
  attachments text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists task_comments_task_idx on task_comments(task_id);
alter table task_comments enable row level security;
drop policy if exists task_comments_rw on task_comments;
create policy task_comments_rw on task_comments for all to authenticated using (true) with check (true);
