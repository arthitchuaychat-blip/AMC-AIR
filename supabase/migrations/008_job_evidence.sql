-- Phase 7+: technician completion evidence on job orders
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table job_orders add column if not exists completion_note text;
alter table job_orders add column if not exists photos text[] default '{}';
