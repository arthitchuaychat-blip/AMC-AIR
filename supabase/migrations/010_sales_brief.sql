-- Job orders: briefing note + preliminary site photos from sales/admin to the technician team
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table job_orders add column if not exists sales_note text;
alter table job_orders add column if not exists sales_photos text[] default '{}';
