-- 110_tm_users.sql — The Top Mentor: บัญชีผู้ใช้ล็อกอิน (admin / mentor)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
-- ปิด anon ทั้งหมด — เข้าถึงผ่าน service role (api/mentor-auth.js) เท่านั้น เพื่อกันรหัสผ่านรั่ว
-- data jsonb = { role:'admin'|'mentor', name, mentorName (สำหรับ mentor ให้ตรงกับ members.mentor), hash }

create table if not exists tm_users (
  username   text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table tm_users enable row level security;
-- ไม่มี policy สำหรับ anon/authenticated → เข้าถึงได้เฉพาะ service_role (ข้าม RLS)
revoke all on tm_users from anon, authenticated;

create or replace function tm_users_touch() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists tm_users_touch on tm_users;
create trigger tm_users_touch before update on tm_users
  for each row execute function tm_users_touch();
