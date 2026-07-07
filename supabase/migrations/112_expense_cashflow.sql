-- 112_expense_cashflow.sql — ใบเบิกจ่ายเป็นเจ้าของกระแสเงินสด (รองรับแบ่งจ่าย)
--   ยอดจ่ายแล้ว → บรรทัด "จ่ายจริง" (source_type=expense_paid)
--   ยอดค้างจ่าย → บรรทัด "ประมาณการจ่าย" (source_type=expense_due) กดเลือก/แก้วันที่ได้ (expected_pay_date)
--   PO ที่ผูกใบเบิก (expense_id) จะให้ใบเบิกคุมกระแสเงินสดแทน (syncCashEntriesFromDocs ข้ามเส้น PO นั้น)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table expense_requests add column if not exists expected_pay_date date;   -- วันคาดว่าจะจ่ายยอดค้าง (แก้ได้)
alter table expense_requests add column if not exists last_paid_at date;        -- วันที่จ่ายงวดล่าสุด (ใช้ลงวันจ่ายจริงในกระแสเงินสด)

-- ล้างบรรทัดกระแสเงินสดแบบเก่า (source_type='expense') — จะถูกสร้างใหม่เป็น expense_paid/expense_due โดยอัตโนมัติ
delete from cash_entries where source_type = 'expense';

comment on column expense_requests.expected_pay_date is 'วันคาดว่าจะจ่ายยอดค้าง (ประมาณการในกระแสเงินสด · แก้ได้)';
