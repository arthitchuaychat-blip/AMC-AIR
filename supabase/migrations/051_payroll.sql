-- 051_payroll.sql — payroll: per-employee pay settings + saved payslips.
-- Pay cycle: cut-off the 25th (period = 26th prev month → 25th this month), paid on the last day.

-- per-employee pay settings (set in HR → กะ & ตั้งค่า)
alter table profiles add column if not exists pay_type text default 'monthly';  -- 'monthly' | 'daily'
alter table profiles add column if not exists base_pay numeric default 0;        -- monthly salary OR daily wage
alter table profiles add column if not exists ot_rate  numeric default 0;        -- baht per OT hour (set per person)
alter table profiles add column if not exists sso      boolean default false;    -- enrolled in social security (หัก 5%)

-- one payslip per employee per period
create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  period text not null,                 -- 'YYYY-MM' = the pay month (period 26th prev → 25th this)
  user_id uuid references auth.users(id) on delete cascade,
  pay_type text,
  base numeric default 0, ot_pay numeric default 0,
  present_days int default 0, absent_days int default 0, leave_days int default 0, over_leave_days int default 0,
  late_min numeric default 0, ot_min numeric default 0,
  d_late numeric default 0, d_absent numeric default 0, d_leave numeric default 0, d_sso numeric default 0,
  bonus numeric default 0, other_deduct numeric default 0, other_note text,
  net numeric default 0,
  status text not null default 'draft' check (status in ('draft','paid')),
  paid_at timestamptz, note text,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (period, user_id)
);
alter table payslips enable row level security;
drop policy if exists payslips_rw on payslips;
create policy payslips_rw on payslips for all
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
