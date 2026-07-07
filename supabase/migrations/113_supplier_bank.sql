-- 113_supplier_bank.sql — เลขบัญชีธนาคารผู้ขาย (ไว้คัดลอกไปโอนเงิน)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table suppliers add column if not exists bank_name    text;   -- ชื่อธนาคาร
alter table suppliers add column if not exists bank_account text;   -- เลขบัญชี
alter table suppliers add column if not exists bank_holder  text;   -- ชื่อบัญชี (ถ้าต่างจากชื่อผู้ขาย)
