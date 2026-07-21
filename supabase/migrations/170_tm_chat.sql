-- 170_tm_chat.sql — The Top Mentor: กล่องแชต LINE ในแอป (เก็บข้อความเข้า–ออกกับสมาชิก)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
-- webhook (mentor-line.js) เขียนข้อความเข้า/ตอบอัตโนมัติ · API (mentor-chat.js) เขียนข้อความที่แอดมินตอบ · แอปอ่านผ่าน anon

create table if not exists tm_chat (
  id           bigserial primary key,
  line_user_id text not null,
  member_id    text,
  dir          text not null check (dir in ('in','out')),
  text         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists tm_chat_uid_idx on tm_chat (line_user_id, created_at);

alter table tm_chat enable row level security;
grant select, insert, update, delete on tm_chat to anon, authenticated;
grant usage, select on sequence tm_chat_id_seq to anon, authenticated;
drop policy if exists tm_chat_all on tm_chat;
create policy tm_chat_all on tm_chat
  for all to anon, authenticated using (true) with check (true);
