-- 238: จดวันเข้าบริการ (แรก/ล่าสุด) บนลูกค้า — ไว้ให้ cron เตือนรอบดูแล + คิดอายุลูกค้าเร็ว ๆ
-- หน้าจอยังคำนวณสดจากประวัติงานเหมือนเดิม · คอลัมน์นี้ = สำเนาไว้ใช้ฝั่ง cron (ไม่ต้องอ่านงานทั้งหมด)
alter table customers add column if not exists first_service_at date;
alter table customers add column if not exists last_service_at  date;

-- backfill จากงานที่เสร็จแล้ว (ประมาณวันบริการจาก scheduled_at ถ้าไม่มีใช้ created_at)
update customers c set
  last_service_at  = s.last_at,
  first_service_at = s.first_at
from (
  select customer_id,
         max(coalesce(scheduled_at::date, created_at::date)) as last_at,
         min(coalesce(scheduled_at::date, created_at::date)) as first_at
  from job_orders
  where status = 'done' and customer_id is not null
  group by customer_id
) s
where c.id = s.customer_id;
