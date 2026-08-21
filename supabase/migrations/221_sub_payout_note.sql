-- 221_sub_payout_note.sql — หมายเหตุ/โน้ตตอนจ่ายค่าแรงช่างซัพ (แสดงบนใบจ่าย + เดินบัญชี)
-- รันใน Supabase → SQL Editor (ครั้งเดียว) · โค้ดมี fallback ถ้ายังไม่รัน (ยังจ่ายได้ แต่โน้ตจะเก็บแค่ในเดินบัญชี)
alter table sub_payouts add column if not exists pay_note text;
select 'sub payout note ready' as status;
