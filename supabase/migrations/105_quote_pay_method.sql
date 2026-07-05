-- 105_quote_pay_method.sql — วิธีการรับเงินบนใบเสนอราคา (เงินสด = ค่าเริ่มต้น เก็บเป็น null)
-- ค่า: null/ว่าง = เงินสด/โอน · 'card_full' = บัตรรูดเต็ม +4% · 'card_inst10' = ผ่อนบัตร 10 เดือน +14%
-- ค่าธรรมเนียมไม่เก็บลงตาราง — คำนวณจากยอดหลังส่วนลด (ก่อน VAT) เสมอ
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table quotations add column if not exists pay_method text
  check (pay_method is null or pay_method in ('card_full', 'card_inst10'));

comment on column quotations.pay_method is 'วิธีการรับเงิน: null=เงินสด/โอน · card_full=บัตรรูดเต็ม +4% · card_inst10=ผ่อนบัตร 10 เดือน +14%';
