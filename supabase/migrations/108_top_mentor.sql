-- 108_top_mentor.sql — The Top Mentor: ระบบติดตาม Mentoring 8 สัปดาห์ + Happiness Survey (แอป /mentor/)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
-- หมายเหตุ: แอปนี้ใช้โดยสมาชิก Chapter (ไม่ใช่พนักงาน) จึงเปิด anon อ่าน/เขียนทั้งตาราง tm_*

-- 1) สมาชิก — เก็บทั้งเรคอร์ดเป็น jsonb (โครงเดียวกับ state ในแอป)
create table if not exists tm_members (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table tm_members enable row level security;
grant select, insert, update, delete on tm_members to anon, authenticated;
drop policy if exists tm_members_all on tm_members;
create policy tm_members_all on tm_members
  for all to anon, authenticated using (true) with check (true);

-- 2) การตั้งค่า (ลิงก์แบบสอบถาม 3 ชุด + template ข้อความ LINE) — แถวเดียว key='main'
create table if not exists tm_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table tm_config enable row level security;
grant select, insert, update, delete on tm_config to anon, authenticated;
drop policy if exists tm_config_all on tm_config;
create policy tm_config_all on tm_config
  for all to anon, authenticated using (true) with check (true);

-- 3) updated_at อัตโนมัติ
create or replace function tm_touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists tm_members_touch on tm_members;
create trigger tm_members_touch before update on tm_members
  for each row execute function tm_touch();
drop trigger if exists tm_config_touch on tm_config;
create trigger tm_config_touch before update on tm_config
  for each row execute function tm_touch();
