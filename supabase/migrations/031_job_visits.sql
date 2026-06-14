-- 031 · รอบเข้างาน (job_visits) — ใบงาน 1 ใบมีได้หลายรอบ
--      แต่ละรอบ = วัน + รอบเวลา + ทีม (ต่อเนื่อง/ไม่ต่อเนื่อง/หลายทีม/คนละทีมต่อวันได้)
create table if not exists job_visits (
  id            bigint generated always as identity primary key,
  job_no        text not null references job_orders(job_no) on delete cascade,
  visit_date    date not null,
  end_date      date,
  slot          text check (slot is null or slot in ('morning','afternoon','full','custom')),
  scheduled_at  timestamptz,
  assigned_team text references teams(id),
  status        text not null default 'scheduled' check (status in ('pending','scheduled','in_progress','done','cancelled')),
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);
create index if not exists idx_job_visits_job on job_visits(job_no);
create index if not exists idx_job_visits_date on job_visits(visit_date);

alter table job_visits enable row level security;
create policy jv_read on job_visits for select to authenticated using (true);
create policy jv_write on job_visits for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy jv_tech_update on job_visits for update to authenticated using (my_role() = 'tech' and assigned_team = my_team()) with check (my_role() = 'tech' and assigned_team = my_team());
create policy jv_lead_update on job_visits for update to authenticated using (my_role() = 'lead_tech') with check (my_role() = 'lead_tech');

-- ย้ายตารางเวลาของใบงานเดิมเป็นรอบแรก (1 รอบ/ใบ) — ไม่เสียของเดิม
insert into job_visits (job_no, visit_date, end_date, slot, scheduled_at, assigned_team, status)
select job_no, (scheduled_at at time zone 'Asia/Bangkok')::date, end_date, slot, scheduled_at, assigned_team, status
from job_orders
where scheduled_at is not null
  and not exists (select 1 from job_visits v where v.job_no = job_orders.job_no);
