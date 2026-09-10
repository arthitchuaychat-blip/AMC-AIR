-- 250: ค่าที่ "ทั้งทีมต้องเห็นตรงกัน" ที่ไม่ควรอยู่ใน app_config (ซึ่งเขียนได้เฉพาะ admin/exec)
-- ใช้เก็บ: เงินสำรองกระแสเงินสด (ต่อกิจการ) · ประวัติทวงหนี้ (ต่อลูกค้า) — แยกเป็นแถวต่อ sub กันเขียนทับกัน
create table if not exists team_kv (
  k          text not null,                       -- กลุ่มค่า เช่น 'cashflow_reserve' / 'ar_dunning'
  sub        text not null default '',            -- คีย์ย่อย เช่น entity ('company'/'personal') หรือ customer_id
  value      jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (k, sub)
);
alter table team_kv enable row level security;
-- อ่านได้ทุกคนที่ล็อกอิน
drop policy if exists team_kv_read on team_kv;
create policy team_kv_read on team_kv for select to authenticated using (true);
-- เขียนได้: ผู้จัดการ/ผู้บริหาร/บัญชีการเงิน/บุคคล (คนที่ดูแลเงิน & เก็บหนี้)
drop policy if exists team_kv_write on team_kv;
create policy team_kv_write on team_kv for all to authenticated
  using (my_role() in ('admin','exec','finance','hr'))
  with check (my_role() in ('admin','exec','finance','hr'));
