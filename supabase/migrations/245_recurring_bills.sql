-- 245: รายจ่ายประจำ (subscription/บิลรายเดือน-รายปี) — ประมาณการล่วงหน้า + ตั้งจ่าย + เตือน (เหมือนหนี้สิน)
create table if not exists recurring_bills (
  id          bigserial primary key,
  name        text not null,                      -- ค่าโทรศัพท์ / อินเทอร์เน็ต / AI / Streaming ...
  provider    text,                               -- Dtac / AIS / GPT / Netflix ...
  ref_no      text,                               -- เบอร์/อีเมล/เลขอ้างอิง
  period      text not null default 'monthly',    -- monthly | yearly
  due_day     int not null default 1,             -- วันครบกำหนดจ่าย
  due_month   int,                                -- เดือนครบกำหนด 1-12 (เฉพาะ yearly)
  amount      numeric not null default 0,
  entity      text not null default 'company',    -- company | personal
  location    text,                               -- Office / Studio ...
  pay_account text,                               -- ช่องทางจ่าย (ชื่อบัตร/บัญชี)
  category    text,                               -- กลุ่ม (ค่าโทรศัพท์/อินเทอร์เน็ต/AI/พื้นที่เก็บข้อมูล/Streaming)
  last_paid_ym text,                              -- งวดล่าสุดที่จ่าย (YYYY-MM รายเดือน · YYYY รายปี)
  active      boolean not null default true,
  note        text,
  created_by  uuid,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table recurring_bills enable row level security;
drop policy if exists recur_read on recurring_bills;
create policy recur_read on recurring_bills for select using (true);
drop policy if exists recur_write on recurring_bills;
create policy recur_write on recurring_bills for all
  using (my_role() in ('admin','exec','finance','hr'))
  with check (my_role() in ('admin','exec','finance','hr'));

-- อนุญาต source_type 'recur' ในกระแสเงินสด (ประมาณการรายจ่ายประจำ)
alter table cash_entries drop constraint if exists cash_entries_source_type_check;
alter table cash_entries add constraint cash_entries_source_type_check
  check (source_type in ('manual','invoice','receipt','payout','po','opening','expense','salary','labor_owed','expense_paid','expense_due','advance','loan','recur'));
