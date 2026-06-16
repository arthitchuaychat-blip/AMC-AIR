-- 040_push_subscriptions.sql
-- Stores each device's Web Push subscription so the server can send team-chat notifications.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- a user manages only their own device subscriptions; the push sender uses the service role (bypasses RLS)
drop policy if exists push_sub_self on push_subscriptions;
create policy push_sub_self on push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
