-- แชตภายในองค์กร: ห้องรวมบริษัท + ทักตัวต่อตัว (DM) + กลุ่ม + ห้องต่อโปรเจ็ก
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- ห้องแชต (1 แถว = 1 ห้อง)
create table if not exists chat_rooms (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('company','dm','group','project')),
  name       text,                     -- ชื่อกลุ่ม/โปรเจ็ก (company/dm เว้นว่างได้ → แสดงชื่อจากสมาชิก)
  ref_type   text,                     -- สำหรับห้องโปรเจ็ก: 'job' | 'quote'
  ref_no     text,                     -- เลขใบงาน/ใบเสนอราคาที่ผูก
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- สมาชิกในห้อง (+ เวลาที่อ่านล่าสุด สำหรับนับข้อความใหม่)
create table if not exists chat_members (
  room_id      bigint not null references chat_rooms(id) on delete cascade,
  user_id      uuid   not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- ข้อความ
create table if not exists chat_messages (
  id         bigint generated always as identity primary key,
  room_id    bigint not null references chat_rooms(id) on delete cascade,
  sender     uuid references auth.users(id) on delete set null,
  text       text,
  image_url  text,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on chat_messages(room_id, created_at);

-- helper: เป็นสมาชิกห้องนี้ไหม (ห้อง company = ทุกคนเป็นสมาชิกอัตโนมัติ)
-- SECURITY DEFINER → อ่าน chat_members ตรงๆ เลี่ยง recursion ใน policy
create or replace function chat_is_member(p_room bigint) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from chat_rooms r where r.id = p_room and (r.kind = 'company' or r.created_by = auth.uid()))
      or exists (select 1 from chat_members m where m.room_id = p_room and m.user_id = auth.uid());
$$;

alter table chat_rooms    enable row level security;
alter table chat_members  enable row level security;
alter table chat_messages enable row level security;

-- ห้อง: เห็นห้อง company + ห้องที่ตัวเองอยู่ · สร้างห้องใหม่ได้ (ทุกพนักงาน)
drop policy if exists cr_read on chat_rooms;
create policy cr_read on chat_rooms for select to authenticated using (kind = 'company' or chat_is_member(id));
drop policy if exists cr_insert on chat_rooms;
create policy cr_insert on chat_rooms for insert to authenticated with check (created_by = auth.uid());
drop policy if exists cr_update on chat_rooms;
create policy cr_update on chat_rooms for update to authenticated using (chat_is_member(id)) with check (chat_is_member(id));

-- สมาชิก: เห็นสมาชิกของห้องที่ตัวเองอยู่ · เพิ่มสมาชิกได้ถ้าเป็นผู้สร้างห้องหรืออยู่ในห้อง · อัปเดต last_read ของตัวเอง
drop policy if exists cm_read on chat_members;
create policy cm_read on chat_members for select to authenticated using (user_id = auth.uid() or chat_is_member(room_id));
drop policy if exists cm_insert on chat_members;
create policy cm_insert on chat_members for insert to authenticated
  with check (exists (select 1 from chat_rooms r where r.id = room_id and r.created_by = auth.uid()) or chat_is_member(room_id) or user_id = auth.uid());
drop policy if exists cm_update on chat_members;
create policy cm_update on chat_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists cm_delete on chat_members;
create policy cm_delete on chat_members for delete to authenticated using (user_id = auth.uid() or exists (select 1 from chat_rooms r where r.id = room_id and r.created_by = auth.uid()));

-- ข้อความ: อ่าน/ส่งได้ถ้าเป็นสมาชิกห้อง
drop policy if exists msg_read on chat_messages;
create policy msg_read on chat_messages for select to authenticated using (chat_is_member(room_id));
drop policy if exists msg_insert on chat_messages;
create policy msg_insert on chat_messages for insert to authenticated with check (chat_is_member(room_id) and sender = auth.uid());

-- ห้องรวมบริษัท (มีห้องเดียว)
insert into chat_rooms (kind, name) select 'company', 'ทั้งบริษัท'
where not exists (select 1 from chat_rooms where kind = 'company');

-- เปิด realtime ให้ข้อความ
alter publication supabase_realtime add table chat_messages;

-- สร้างห้องผ่าน RPC (SECURITY DEFINER) — เลี่ยงปัญหา insert RLS ทั้งหมด
create or replace function chat_start_dm(p_other uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_room bigint;
begin
  select r.id into v_room from chat_rooms r
   where r.kind = 'dm'
     and exists (select 1 from chat_members m where m.room_id = r.id and m.user_id = v_me)
     and exists (select 1 from chat_members m where m.room_id = r.id and m.user_id = p_other)
   limit 1;
  if v_room is not null then return v_room; end if;
  insert into chat_rooms(kind, created_by) values ('dm', v_me) returning id into v_room;
  insert into chat_members(room_id, user_id) values (v_room, v_me), (v_room, p_other);
  return v_room;
end; $$;

create or replace function chat_create_room(p_name text, p_members uuid[], p_ref_type text, p_ref_no text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_room bigint;
  v_kind text := case when coalesce(p_ref_no,'') <> '' then 'project' else 'group' end;
begin
  insert into chat_rooms(kind, name, ref_type, ref_no, created_by)
    values (v_kind, nullif(trim(p_name), ''), p_ref_type, nullif(p_ref_no,''), v_me) returning id into v_room;
  insert into chat_members(room_id, user_id)
    select v_room, uid from (select distinct unnest(array_append(coalesce(p_members,'{}'::uuid[]), v_me)) as uid) s
    where uid is not null;
  return v_room;
end; $$;

grant execute on function chat_start_dm(uuid) to authenticated;
grant execute on function chat_create_room(text, uuid[], text, text) to authenticated;
