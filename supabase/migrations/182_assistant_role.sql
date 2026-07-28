-- 182_assistant_role.sql — ตำแหน่งใหม่ "ผู้ช่วยช่าง" (assistant) = เหมือนช่าง (tech) ทุกอย่าง
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- 1) อนุญาตค่า role ใหม่ 'assistant' (เดิม mig 082 ไม่มี)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('exec','admin','finance','hr','sales','graphic','stock','lead_tech','tech','maid','assistant'));

-- 2) ให้ RLS ทุกนโยบายที่ให้สิทธิ์ 'tech' ครอบคลุม 'assistant' ทันที
--    วิธี: my_role() คืนค่า 'tech' เมื่อผู้ใช้เป็น assistant (จึงไม่ต้องแก้ policy เก่านับสิบอัน)
--    หมายเหตุ: แอปยังอ่าน profiles.role ตรง ๆ = 'assistant' → ป้าย/สิทธิ์เมนูฝั่งแอปแยกจากช่างตามปกติ
create or replace function my_role() returns text
  language sql stable security definer set search_path = public
as $$
  select case when role = 'assistant' then 'tech' else role end
  from profiles where id = auth.uid()
$$;

-- ✅ ตรวจผล
select 'assistant role ready' as status;

-- ── ROLLBACK (ถ้าต้องย้อน my_role กลับเป็นเดิม) ──
-- create or replace function my_role() returns text
--   language sql stable security definer set search_path = public
-- as $$ select role from profiles where id = auth.uid() $$;
