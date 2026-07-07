-- 118_boq_section_force.sql — บังคับแก้ constraint หมวด BOQ ให้รับ 'service' แบบชัวร์
-- เหตุผล: ถ้า constraint เดิมชื่อไม่ใช่ boq_items_section_check การ drop by name จะไม่ลบตัวเก่า
--         → เหลือ constraint 2 ตัวซ้อน ตัวเก่า (3 ค่า) ยังบล็อก 'service' อยู่ → บันทึกค่าบริการไม่ได้เหมือนเดิม
-- วิธีนี้: ลบ "ทุก" check constraint ที่อ้างถึงคอลัมน์ section ทิ้งก่อน แล้วค่อยเพิ่มตัวที่ถูกต้อง (รันซ้ำได้)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'boq_items'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%section%'
  loop
    execute format('alter table boq_items drop constraint %I', c.conname);
  end loop;
  alter table boq_items add constraint boq_items_section_check
    check (section in ('ac', 'free', 'charged', 'service'));
end $$;

-- ✅ ตรวจผล: ต้องมี constraint เดียว และมี service (ถ้าเห็นหลายบรรทัด = ยังมีตัวซ้อน)
select conname, pg_get_constraintdef(oid) as นิยาม
from pg_constraint
where conrelid = 'boq_items'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%section%';
