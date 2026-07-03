-- 091_subpayout_account.sql — เลือกบัญชีที่ใช้จ่ายค่าแรงช่างซัพ (ลิงก์เข้ารายการเดินบัญชี account_entries)
-- ตอนกดบันทึกจ่ายเงิน จะสร้างรายการเงินออกในบัญชีที่เลือก (kind='payout') · รันครั้งเดียว

alter table sub_payouts add column if not exists paid_from uuid references accounts(id);
