-- Phase 7+: technician completion evidence on job orders
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table job_orders add column if not exists completion_note text;
alter table job_orders add column if not exists photos text[] default '{}';

-- ช่างทำได้เฉพาะ เบิกออก/รับคืน ของทีมตัวเอง (ห้ามซื้อ/ตัดเสีย) — บังคับที่ระดับฐานข้อมูล
drop policy if exists txn_insert on transactions;
create policy txn_insert on transactions for insert to authenticated
  with check (my_role() = 'admin' or (my_role() = 'tech' and team = my_team() and type in ('withdraw','return')));
