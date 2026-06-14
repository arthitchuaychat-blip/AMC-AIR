-- 030 · ประเภทงานในใบงาน (สำรวจ/ติดตั้ง/ซ่อม/ล้าง/อื่นๆ) — ใช้กรอง + ลงสีในปฏิทิน
alter table job_orders add column if not exists job_type text not null default 'install';
