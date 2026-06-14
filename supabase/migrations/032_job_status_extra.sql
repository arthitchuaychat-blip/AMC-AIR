-- 032 · เพิ่มสถานะ "รออนุมัติ" (awaiting_approval) และ "รอนัดหมายใหม่" (reschedule)
--      ให้ทั้งใบงาน (job_orders) และรอบเข้างาน (job_visits)
alter table job_orders drop constraint if exists job_orders_status_check;
alter table job_orders add constraint job_orders_status_check
  check (status in ('pending','scheduled','in_progress','awaiting_approval','reschedule','done','cancelled'));

alter table job_visits drop constraint if exists job_visits_status_check;
alter table job_visits add constraint job_visits_status_check
  check (status in ('pending','scheduled','in_progress','awaiting_approval','reschedule','done','cancelled'));
