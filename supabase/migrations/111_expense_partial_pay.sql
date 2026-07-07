-- 111_expense_partial_pay.sql — แบ่งจ่ายใบเบิก (จ่ายทีละงวด) เก็บยอดที่จ่ายสะสม
-- ยอดจ่ายครบ → status = paid · จ่ายบางส่วน → status ยังเป็น approved แต่ paid_amount > 0
-- ประวัติการจ่ายแต่ละงวดอยู่ใน account_entries (ref_type='expense', ref_id) อยู่แล้ว
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table expense_requests add column if not exists paid_amount numeric not null default 0;

comment on column expense_requests.paid_amount is 'ยอดที่จ่ายสะสม (แบ่งจ่าย) — เท่ากับ amount เมื่อ status=paid';
