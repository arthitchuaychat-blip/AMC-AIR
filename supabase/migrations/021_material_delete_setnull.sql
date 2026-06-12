-- ให้ลบวัสดุได้แม้ถูกอ้างใน BOQ/ใบเสนอราคา โดยเคลียร์ลิงก์เป็น NULL (เก็บชื่อ/จำนวน/ราคาในเอกสารไว้)
-- แก้ปัญหา: delete on table "materials" violates foreign key "boq_items_item_code_fkey"
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table boq_items drop constraint if exists boq_items_item_code_fkey;
alter table boq_items add constraint boq_items_item_code_fkey
  foreign key (item_code) references materials(code) on delete set null;

alter table quotation_items drop constraint if exists quotation_items_item_code_fkey;
alter table quotation_items add constraint quotation_items_item_code_fkey
  foreign key (item_code) references materials(code) on delete set null;
