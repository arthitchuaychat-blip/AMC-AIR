-- 190: แชตทีม กลุ่ม A — ตอบกลับ (reply) + รีแอกชัน + ลบข้อความตัวเอง
alter table chat_messages add column if not exists reply_to   bigint references chat_messages(id) on delete set null;  -- อ้างข้อความที่ตอบ
alter table chat_messages add column if not exists deleted_at timestamptz;                                            -- ลบแบบซอฟต์ (คงโครงเธรด/รีแอกชัน)

-- รีแอกชัน (1 คน 1 อีโมจิต่อข้อความ)
create table if not exists chat_reactions (
  message_id bigint not null references chat_messages(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  emoji      text   not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table chat_reactions enable row level security;
-- อ่าน: สมาชิกห้องของข้อความนั้น · เขียน/ลบ: เฉพาะรีแอกชันของตัวเอง (ในห้องที่เป็นสมาชิก)
drop policy if exists rx_read on chat_reactions;
create policy rx_read on chat_reactions for select to authenticated using (
  exists (select 1 from chat_messages m where m.id = message_id and chat_is_member(m.room_id)));
drop policy if exists rx_insert on chat_reactions;
create policy rx_insert on chat_reactions for insert to authenticated with check (
  user_id = auth.uid() and exists (select 1 from chat_messages m where m.id = message_id and chat_is_member(m.room_id)));
drop policy if exists rx_delete on chat_reactions;
create policy rx_delete on chat_reactions for delete to authenticated using (user_id = auth.uid());
alter publication supabase_realtime add table chat_reactions;

-- ลบข้อความตัวเอง (ซอฟต์ · ล้างเนื้อหา คงแถวไว้ให้ reply/รีแอกชันไม่พัง) — เฉพาะเจ้าของข้อความ
create or replace function chat_delete_message(p_msg bigint) returns void
language sql security definer set search_path = public as $$
  update chat_messages set deleted_at = now(), text = null, image_url = null, file_url = null, file_name = null
  where id = p_msg and sender = auth.uid();
$$;
grant execute on function chat_delete_message(bigint) to authenticated;

-- rollback:
-- drop function if exists chat_delete_message(bigint);
-- drop table if exists chat_reactions;
-- alter table chat_messages drop column if exists reply_to; alter table chat_messages drop column if exists deleted_at;
