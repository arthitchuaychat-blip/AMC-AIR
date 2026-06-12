-- ปฏิทินตารางงาน: รองรับช่วงวันหลายวัน + ช่วงเวลา (slot)
-- slot = morning(10-13) / afternoon(14-17) / full(เต็มวัน) / custom(กำหนดเวลาเอง)
-- end_date = วันสิ้นสุด (งานหลายวัน) — ถ้างานวันเดียว เว้นว่าง
-- scheduled_at ยังคงเป็นวัน+เวลาเริ่มงานเหมือนเดิม (เวลาเริ่มมาจาก slot)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table job_orders add column if not exists slot     text;
alter table job_orders add column if not exists end_date date;

alter table job_orders drop constraint if exists job_orders_slot_check;
alter table job_orders add constraint job_orders_slot_check
  check (slot is null or slot in ('morning','afternoon','full','custom'));
