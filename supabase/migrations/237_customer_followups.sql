-- 237: ประวัติการติดตามลูกค้า (log) — ปิดลูป "ติดตามวันนี้" + ตั้งเตือนจากแชต + วัด KPI วินัยติดตาม
-- วันนัดครั้งถัดไปยังเก็บที่ customers.next_followup (mig 199) เหมือนเดิม · ตารางนี้ = ประวัติผลการติดตามแต่ละครั้ง
create table if not exists customer_followups (
  id bigserial primary key,
  customer_id bigint not null,
  owner_id uuid,                 -- ผู้ดูแล/ผู้ติดตาม (ดึงจาก customers.owner_id ตอนบันทึก)
  reason text,                   -- ต้นเหตุ: sales(ปิดการขาย) | service(รอบล้างแอร์) | quote(ใบเสนอค้าง) | other
  outcome text,                  -- ผล: talked | reschedule | won | lost | no_answer
  note text,
  next_at date,                  -- นัดติดตามครั้งถัดไป
  created_by uuid,
  created_at timestamptz default now()
);
create index if not exists customer_followups_cust  on customer_followups(customer_id, created_at);
create index if not exists customer_followups_owner on customer_followups(owner_id, created_at);
alter table customer_followups enable row level security;
drop policy if exists customer_followups_read on customer_followups;
create policy customer_followups_read on customer_followups for select using (true);
drop policy if exists customer_followups_write on customer_followups;
create policy customer_followups_write on customer_followups for all
  using (my_role() in ('admin','exec','finance','hr','sales','field_sales'))
  with check (my_role() in ('admin','exec','finance','hr','sales','field_sales'));
