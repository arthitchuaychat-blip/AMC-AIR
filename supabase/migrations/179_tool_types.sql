-- 179_tool_types.sql — เมนูหลัก "ชนิดเครื่องมือ" + ชุดมาตรฐาน (ต่อคน/ต่อทีม)
-- tool_types = รายการชนิดเครื่องมือกลาง ให้ตอนบันทึกเครื่องมือของคน/ทีม เลือกจากเมนูนี้
-- std_personal / std_vehicle = จำนวนมาตรฐานที่ "ควรมี" ต่อช่าง 1 คน / ต่อทีม 1 ทีม → ใช้เช็ก มี/ขาด
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists tool_types (
  id           text primary key,
  name         text not null,
  emoji        text,
  std_personal int not null default 0,   -- จำนวนมาตรฐานต่อช่าง 1 คน (ชุดประจำตัว)
  std_vehicle  int not null default 0,   -- จำนวนมาตรฐานต่อทีม 1 ทีม (ชุดประจำรถ)
  sort         int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ผูกเครื่องมือแต่ละชิ้นเข้ากับชนิดในเมนูหลัก (ไม่บังคับ — ลบชนิดแล้วชิ้นยังอยู่)
alter table tools add column if not exists type_id text references tool_types(id) on delete set null;
create index if not exists tools_type_idx on tools(type_id);

alter table tool_types enable row level security;
drop policy if exists tooltypes_read on tool_types;
create policy tooltypes_read on tool_types for select to authenticated using (true);
drop policy if exists tooltypes_write on tool_types;
create policy tooltypes_write on tool_types for all to authenticated
  using (my_role() in ('admin','exec','stock')) with check (my_role() in ('admin','exec','stock'));

-- ✅ ตรวจผล
select 'tool_types ready' as status;
