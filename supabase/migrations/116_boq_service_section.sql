-- 116_boq_service_section.sql — ให้ BOQ บันทึกรายการ "ค่าบริการ" ได้
-- อาการ: เพิ่มรายการค่าบริการใน BOQ แล้วกดบันทึกไม่ได้ (new row violates check constraint "boq_items_section_check")
-- สาเหตุ: constraint เดิมของ boq_items.section มีแค่ ('ac','free','charged') — section 'service' ถูกเพิ่มในแอปทีหลัง
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table boq_items drop constraint if exists boq_items_section_check;
alter table boq_items add constraint boq_items_section_check
  check (section in ('ac', 'free', 'charged', 'service'));

-- ✅ ตรวจผล: เงื่อนไข section ต้องมี service
select conname, pg_get_constraintdef(oid) as นิยาม
from pg_constraint where conrelid = 'boq_items'::regclass and conname = 'boq_items_section_check';
