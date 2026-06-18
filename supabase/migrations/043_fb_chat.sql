-- 043_fb_chat.sql — Facebook Messenger chat, mirroring the LINE chat tables so the inbox UI can reuse the shape.

create table if not exists fb_contacts (
  psid            text primary key,                     -- page-scoped user id
  display_name    text,
  picture_url     text,
  customer_id     bigint references customers(id) on delete set null,
  last_message    text,
  last_message_at timestamptz,
  unread          int not null default 0,
  stage           text default 'new',
  assigned_to     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists fb_messages (
  id            bigint generated always as identity primary key,
  psid          text not null references fb_contacts(psid) on delete cascade,
  direction     text not null check (direction in ('in','out')),
  type          text not null default 'text',
  text          text,
  image_url     text,
  file_url      text,
  file_name     text,
  fb_message_id text,
  sent_by       uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_fb_msg_user on fb_messages(psid, created_at);

alter table fb_contacts enable row level security;
alter table fb_messages enable row level security;

drop policy if exists fb_contacts_read on fb_contacts;
create policy fb_contacts_read on fb_contacts for select using (true);
drop policy if exists fb_contacts_write on fb_contacts;
create policy fb_contacts_write on fb_contacts for all
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

drop policy if exists fb_messages_read on fb_messages;
create policy fb_messages_read on fb_messages for select using (true);
drop policy if exists fb_messages_write on fb_messages;
create policy fb_messages_write on fb_messages for all
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
