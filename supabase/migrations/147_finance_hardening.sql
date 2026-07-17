-- 147_finance_hardening.sql — เก็บแข็งระบบการเงิน (จากรีวิว 2026-07-17)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- 1) เงินสดยกมา (opening) ต้องมีแถวเดียว — บันทึกชนกัน 2 เครื่องเคยสร้างแถวซ้ำ
--    ทำให้ระบบอ่านค่าไม่ได้ (คืน 0 เงียบ ๆ) → "เงินจริงสะสม" ทั้งจอกระแสเงินสดเพี้ยน
delete from cash_entries a using cash_entries b
  where a.source_type = 'opening' and b.source_type = 'opening' and a.id > b.id;
create unique index if not exists cash_entries_opening_one
  on cash_entries (source_type) where source_type = 'opening';

-- 2) เบิกเงินล่วงหน้าพนักงานลงกระแสเงินสด (source_type 'advance')
--    เงินโอนเบิกล่วงหน้าเป็นเงินออกจริงที่กระแสเงินสดมองไม่เห็นมาตลอด (เดินบัญชีเห็นอยู่แล้ว)
--    ไม่นับซ้ำกับเงินเดือน: ยอดเงินเดือนที่ลงกระแสเงินสดเป็นยอดสุทธิหลังหักเบิกล่วงหน้าแล้ว (advance + net = gross)
alter table cash_entries drop constraint if exists cash_entries_source_type_check;
alter table cash_entries add constraint cash_entries_source_type_check
  check (source_type in ('manual','invoice','receipt','payout','po','opening','expense','salary','labor_owed','expense_paid','expense_due','advance'));
