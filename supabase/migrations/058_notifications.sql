-- 058_notifications.sql — in-app notification center for all app activities.
-- Categories: team_chat | task | job | hr | customer_chat. Per-role on/off lives in app_config (notify_settings).

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- recipient
  category text not null,
  title text not null,
  body text,
  url text,                       -- module id to navigate to (e.g. 'tasks','joborders','hr','chat','teamchat')
  ref_type text, ref_no text,
  actor uuid,                     -- who triggered it
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications(user_id, created_at desc);
alter table notifications enable row level security;
-- recipients read their own; any authenticated user may create notifications for others; recipient marks read
drop policy if exists notifications_read on notifications;
create policy notifications_read on notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert to authenticated with check (true);
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications for delete to authenticated using (user_id = auth.uid());
