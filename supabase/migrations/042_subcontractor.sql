-- 042_subcontractor.sql — subcontractor teams, per-job labor cost, payouts, simple review.

-- team becomes either a permanent crew or a subcontractor (paid per job)
alter table teams add column if not exists type        text default 'permanent'; -- 'permanent' | 'sub'
alter table teams add column if not exists phone       text;
alter table teams add column if not exists tax_id      text;
alter table teams add column if not exists bank_info   text;
alter table teams add column if not exists payout_rate numeric default 80;        -- default % of sale → labor

-- per-job subcontractor labor (filled by accounting; lines default to payout_rate% of each sale line)
alter table job_orders add column if not exists labor_lines jsonb;                 -- [{code,name,sale,labor}]
alter table job_orders add column if not exists labor_total numeric default 0;
alter table job_orders add column if not exists labor_paid  boolean default false;
alter table job_orders add column if not exists payout_id   uuid;
alter table job_orders add column if not exists rating      int;                   -- 1..5 (office review)
alter table job_orders add column if not exists is_claim    boolean default false; -- งานเคลม/แก้ซ้ำ

-- subcontractor payout batches (a payment run to one sub team)
create table if not exists sub_payouts (
  id uuid primary key default gen_random_uuid(),
  team text references teams(id),
  job_nos text[] not null default '{}',
  gross numeric not null default 0,
  wht_rate numeric not null default 3,
  wht_amt numeric not null default 0,   -- only on the VAT-billed jobs' labor
  net numeric not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid','paid')),
  paid_at timestamptz, method text, note text,
  created_by uuid, created_at timestamptz not null default now()
);
alter table sub_payouts enable row level security;
drop policy if exists sub_payouts_rw on sub_payouts;
create policy sub_payouts_rw on sub_payouts for all
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
