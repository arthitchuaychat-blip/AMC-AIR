-- 196_profile_active.sql — สถานะ "พ้นสภาพ" พนักงาน (แทนการลบ — ลบไม่ได้เพราะผูกเอกสาร/งาน/เงินเดือน)
-- พนักงานที่ active=false: หายจากรายชื่อปัจจุบัน (HR/เข้างาน/เงินเดือน/มอบงาน) + ล็อกอินไม่ได้
-- แต่ชื่อยังอยู่บนเอกสารเก่าทุกอย่าง (ประวัติคงเดิม)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table profiles add column if not exists active boolean not null default true;
create index if not exists profiles_active_idx on profiles(active) where active = true;

-- ✅ ตรวจผล
select 'profiles.active ready' as status;
