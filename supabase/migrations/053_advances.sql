-- 053_advances.sql — employee cash advances (เบิกเงินล่วงหน้า).
-- Staff request from the Attendance page → HR/finance approve → deducted in the next payroll run.

create table if not exists hr_advances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null default 0,
  reason text,
  request_date date not null default current_date,
  status text not null default 'pending' check (status in ('pending','approved','rejected','paid')),
  period text,                 -- pay month 'YYYY-MM' it was deducted in (set when payroll is paid)
  decided_by uuid, decided_at timestamptz, decide_note text,
  created_by uuid, created_at timestamptz not null default now()
);
create index if not exists hr_advances_user_idx on hr_advances(user_id);
create index if not exists hr_advances_status_idx on hr_advances(status);
alter table hr_advances enable row level security;
-- staff manage their own (request + cancel while pending); office (admin/exec/finance) manage all
drop policy if exists hr_advances_self on hr_advances;
create policy hr_advances_self on hr_advances for all
  using (user_id = auth.uid() or my_role() in ('admin','exec','finance'))
  with check (user_id = auth.uid() or my_role() in ('admin','exec','finance'));

-- payroll: remember the advance amount deducted on each payslip
alter table payslips add column if not exists d_advance numeric default 0;
