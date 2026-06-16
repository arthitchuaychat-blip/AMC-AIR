-- 039_role_permissions.sql
-- Stores the editable role→module permission matrix as one JSON row.
-- Everyone may READ it (the app needs it to build each user's menu); only ธุรการ/ผู้บริหาร may WRITE.

create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;

drop policy if exists app_config_read on app_config;
create policy app_config_read on app_config
  for select using (true);

drop policy if exists app_config_write on app_config;
create policy app_config_write on app_config
  for all
  using (my_role() in ('admin','exec'))
  with check (my_role() in ('admin','exec'));
