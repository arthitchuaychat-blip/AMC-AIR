-- 041_hr.sql — HR: attendance (check-in/out), leave requests, holidays, leave quota.
-- Reuses app_config (migration 039) for hr_settings. Reuses my_role() for manager checks.

-- profile additions for HR scheduling (independent of the app permission role)
alter table profiles add column if not exists hire_date    date;
alter table profiles add column if not exists department   text;                 -- ช่าง/ขาย/บัญชี/การตลาด/แม่บ้าน/ธุรการ
alter table profiles add column if not exists work_pattern text default 'mon_sat';-- mon_sat | mon_fri | mon_fri_alt_sat | none
alter table profiles add column if not exists sat_group    text;                  -- 'A' | 'B' (for เสาร์เว้นเสาร์)

-- company / public holidays (no absence on these days)
create table if not exists hr_holidays (
  day  date primary key,
  name text not null
);
alter table hr_holidays enable row level security;
drop policy if exists hr_holidays_read on hr_holidays;
create policy hr_holidays_read on hr_holidays for select using (true);
drop policy if exists hr_holidays_write on hr_holidays;
create policy hr_holidays_write on hr_holidays for all
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));

-- one attendance row per user per day
create table if not exists hr_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  check_in_at timestamptz, check_in_lat double precision, check_in_lng double precision, check_in_photo text,
  check_out_at timestamptz, check_out_lat double precision, check_out_lng double precision, check_out_photo text,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, work_date)
);
create index if not exists hr_attendance_date_idx on hr_attendance(work_date);
alter table hr_attendance enable row level security;
-- everyone manages their own rows; managers can read/adjust all
drop policy if exists hr_att_self on hr_attendance;
create policy hr_att_self on hr_attendance for all
  using (user_id = auth.uid() or my_role() in ('admin','exec'))
  with check (user_id = auth.uid() or my_role() in ('admin','exec'));

-- leave requests
create table if not exists hr_leaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('sick','personal','vacation')),
  start_date date not null, end_date date not null,
  days numeric not null default 1,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid, decided_at timestamptz, decide_note text,
  created_at timestamptz not null default now()
);
create index if not exists hr_leaves_user_idx on hr_leaves(user_id);
alter table hr_leaves enable row level security;
drop policy if exists hr_leaves_self on hr_leaves;
-- a user sees/creates their own; managers see all and decide
create policy hr_leaves_self on hr_leaves for all
  using (user_id = auth.uid() or my_role() in ('admin','exec'))
  with check (user_id = auth.uid() or my_role() in ('admin','exec'));

-- optional per-year quota override (defaults live in hr_settings if a row is absent)
create table if not exists hr_leave_quota (
  user_id uuid not null references auth.users(id) on delete cascade,
  year int not null,
  vacation int not null default 6,
  personal int not null default 3,
  sick int not null default 30,
  primary key (user_id, year)
);
alter table hr_leave_quota enable row level security;
drop policy if exists hr_quota_read on hr_leave_quota;
create policy hr_quota_read on hr_leave_quota for select using (true);
drop policy if exists hr_quota_write on hr_leave_quota;
create policy hr_quota_write on hr_leave_quota for all
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));
