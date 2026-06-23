-- 066_job_quote_pending.sql
-- เพิ่มสถานะใบงาน "รอทำใบเสนอราคา" (quote_pending) — ขั้นก่อนจ่ายงาน เมื่อยังไม่มีใบเสนอราคา/รอบเข้างาน
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table job_orders drop constraint if exists job_orders_status_check;
alter table job_orders add constraint job_orders_status_check
  check (status in ('quote_pending','pending','scheduled','in_progress','awaiting_approval','reschedule','done','cancelled'));
