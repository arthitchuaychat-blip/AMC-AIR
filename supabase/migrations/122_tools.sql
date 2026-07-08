-- 122_tools.sql — ทะเบียนเครื่องมือช่าง + การเบิก/คืน/แจ้งชำรุด
-- เครื่องมือ 3 ที่อยู่: สต๊อก (สำรอง/เฉพาะงาน) · ประจำรถทีม (หัวหน้าทีมรับผิดชอบ) · ประจำตัวช่าง
-- ทุกคนเห็นทะเบียน + สร้างคำขอเบิก/คืนได้ · ธุรการวัสดุ/ธุรการ/ผู้บริหาร จัดการทะเบียน + อนุมัติ
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists tools (
  id         bigint generated always as identity primary key,
  code       text,                                   -- รหัส/หมายเลขเครื่อง (serial)
  name       text not null,
  detail     text,                                   -- ยี่ห้อ/สเปค
  photo_url  text,
  location   text not null default 'stock' check (location in ('stock','vehicle','person')),
  team       text references teams(id) on delete set null,        -- เมื่อประจำรถ
  holder     uuid references auth.users(id) on delete set null,   -- เมื่อประจำตัว
  status     text not null default 'normal' check (status in ('normal','broken','repair','lost')),
  note       text,
  created_at timestamptz not null default now()
);

create table if not exists tool_moves (
  id           bigint generated always as identity primary key,
  tool_id      bigint not null references tools(id) on delete cascade,
  move_type    text not null check (move_type in ('withdraw','return','report','transfer')),
  to_loc       text,                                 -- ปลายทาง: stock/vehicle/person
  to_team      text,
  to_holder    uuid references auth.users(id) on delete set null,
  to_status    text,                                 -- สำหรับแจ้งชำรุด/หาย (broken/repair/lost)
  job_no       text,                                 -- เบิกไปใช้งานไหน (เครื่องมือเฉพาะงาน)
  note         text,
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid references auth.users(id),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists tool_moves_tool_idx on tool_moves(tool_id);
create index if not exists tool_moves_status_idx on tool_moves(status);

alter table tools enable row level security;
drop policy if exists tools_read on tools;
create policy tools_read on tools for select to authenticated using (true);
drop policy if exists tools_write on tools;
create policy tools_write on tools for all to authenticated
  using (my_role() in ('admin','exec','stock')) with check (my_role() in ('admin','exec','stock'));

alter table tool_moves enable row level security;
drop policy if exists toolmv_read on tool_moves;
create policy toolmv_read on tool_moves for select to authenticated using (true);
drop policy if exists toolmv_insert on tool_moves;
create policy toolmv_insert on tool_moves for insert to authenticated with check (requested_by = auth.uid());
drop policy if exists toolmv_update on tool_moves;
create policy toolmv_update on tool_moves for update to authenticated
  using (my_role() in ('admin','exec','stock'));
drop policy if exists toolmv_delete on tool_moves;
create policy toolmv_delete on tool_moves for delete to authenticated
  using (my_role() in ('admin','exec','stock') or (requested_by = auth.uid() and status = 'pending'));

-- ✅ ตรวจผล
select table_name from information_schema.tables where table_name in ('tools','tool_moves');
