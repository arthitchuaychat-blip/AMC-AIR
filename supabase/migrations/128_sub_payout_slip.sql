-- 128_sub_payout_slip.sql — แนบสลิปโอนเงินเป็นหลักฐานตอนจ่ายค่าแรงช่างซัพ
-- รันใน Supabase → SQL Editor (ครั้งเดียว · รันซ้ำได้)

alter table sub_payouts add column if not exists pay_slip_url text;

-- ✅ ตรวจผล
select column_name from information_schema.columns where table_name = 'sub_payouts' and column_name = 'pay_slip_url';
