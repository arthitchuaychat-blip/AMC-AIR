-- 137_chat_notes.sql — โน้ตประจำห้องแชตทีม (แบบ Note ของ LINE)
-- สมาชิกห้องสร้าง/อ่านได้ · เจ้าของโน้ตหรือทีมหลังบ้านแก้/ลบได้ · แนบรูปไม่จำกัด (เก็บเป็น jsonb)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists chat_notes (
  id         bigint generated always as identity primary key,
  room_id    bigint not null references chat_rooms(id) on delete cascade,
  author     uuid references auth.users(id),
  text       text not null default '',
  images     jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chat_notes_room_idx on chat_notes(room_id, created_at desc);

alter table chat_notes enable row level security;
grant select, insert, update, delete on chat_notes to authenticated;

-- อ่าน: สมาชิกห้อง หรือทีมหลังบ้าน
drop policy if exists cn_read on chat_notes;
create policy cn_read on chat_notes for select to authenticated
  using (chat_is_member(room_id) or my_role() in ('admin','exec','finance','sales'));

-- สร้าง: สมาชิกห้อง (ต้องเป็นโน้ตของตัวเอง)
drop policy if exists cn_insert on chat_notes;
create policy cn_insert on chat_notes for insert to authenticated
  with check (author = auth.uid() and (chat_is_member(room_id) or my_role() in ('admin','exec','finance','sales')));

-- แก้/ลบ: เจ้าของโน้ต หรือทีมหลังบ้าน
drop policy if exists cn_update on chat_notes;
create policy cn_update on chat_notes for update to authenticated
  using (author = auth.uid() or my_role() in ('admin','exec','finance','sales'))
  with check (author = auth.uid() or my_role() in ('admin','exec','finance','sales'));
drop policy if exists cn_delete on chat_notes;
create policy cn_delete on chat_notes for delete to authenticated
  using (author = auth.uid() or my_role() in ('admin','exec','finance','sales'));

-- ✅ ตรวจผล: ต้องเห็นตาราง chat_notes
select column_name from information_schema.columns where table_name = 'chat_notes' order by ordinal_position;
