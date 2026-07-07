-- 117_boq_save_fix_all.sql — แก้ทุกสาเหตุที่ทำให้ "บันทึก BOQ แล้วรายการหาย/ไม่เข้า" ในครั้งเดียว
-- ครอบ 3 จุด: (1) constraint section ไม่รวม service · (2) คอลัมน์ description หาย · (3) สิทธิ์เขียนไม่ครบ
-- ปลอดภัย/รันซ้ำได้ · รันใน Supabase → SQL Editor (ครั้งเดียว)

-- (1) คอลัมน์ description รายบรรทัด (มิเกรชัน 026)
alter table boq_items       add column if not exists description text;
alter table quotation_items add column if not exists description text;

-- (2) หมวด section ต้องรับ 'service' (ค่าบริการ) — มิเกรชัน 116
alter table boq_items drop constraint if exists boq_items_section_check;
alter table boq_items add constraint boq_items_section_check
  check (section in ('ac', 'free', 'charged', 'service'));

-- (3) สิทธิ์เขียน BOQ + รายการ BOQ ให้ครบ (ธุรการ/ขาย/ผู้บริหาร/การเงิน/HR) — เผื่อ live ยังเป็นชุดเก่า
drop policy if exists boq_write on boqs;
create policy boq_write on boqs for all to authenticated
  using (my_role() in ('admin', 'sales', 'exec', 'finance', 'hr'))
  with check (my_role() in ('admin', 'sales', 'exec', 'finance', 'hr'));
drop policy if exists boqi_write on boq_items;
create policy boqi_write on boq_items for all to authenticated
  using (my_role() in ('admin', 'sales', 'exec', 'finance', 'hr'))
  with check (my_role() in ('admin', 'sales', 'exec', 'finance', 'hr'));

-- ✅ ตรวจผล
select conname, pg_get_constraintdef(oid) as section_check
from pg_constraint where conrelid = 'boq_items'::regclass and conname = 'boq_items_section_check';
select column_name from information_schema.columns where table_name = 'boq_items' and column_name = 'description';
select polname, pg_get_expr(polwithcheck, polrelid) as เขียนได้โดย
from pg_policy where polrelid in ('boqs'::regclass, 'boq_items'::regclass) and polname in ('boq_write', 'boqi_write');
