-- 210_field_sales_role.sql — ตำแหน่งใหม่ "ขายภาคสนาม" (field_sales) = เหมือน "ขาย" (sales) ทุกอย่าง
-- รันใน Supabase → SQL Editor (ครั้งเดียว) · แนวเดียวกับ mig 182 (assistant = tech)

-- 1) อนุญาตค่า role ใหม่ 'field_sales' (คงค่าเดิมทั้งหมด รวม 'assistant' จาก mig 182)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('exec','admin','finance','hr','sales','field_sales','graphic','stock','lead_tech','tech','maid','assistant'));

-- 2) ให้ RLS ทุกนโยบายที่ให้สิทธิ์ 'sales' ครอบคลุม 'field_sales' ทันที (ไม่ต้องแก้ policy เก่า)
--    my_role() คืน 'sales' เมื่อ field_sales · คง 'tech' เมื่อ assistant (จาก mig 182) ไว้ด้วย
--    หมายเหตุ: แอปยังอ่าน profiles.role ตรง ๆ = 'field_sales' → ป้าย/เมนูฝั่งแอปแยกจากขายตามปกติ
create or replace function my_role() returns text
  language sql stable security definer set search_path = public
as $$
  select case
           when role = 'assistant'   then 'tech'
           when role = 'field_sales' then 'sales'
           else role
         end
  from profiles where id = auth.uid()
$$;

-- ✅ ตรวจผล
select 'field_sales role ready' as status;

-- ── ROLLBACK (ย้อน my_role กลับเป็นแบบ mig 182: assistant→tech เท่านั้น) ──
-- create or replace function my_role() returns text
--   language sql stable security definer set search_path = public
-- as $$ select case when role = 'assistant' then 'tech' else role end
--        from profiles where id = auth.uid() $$;
