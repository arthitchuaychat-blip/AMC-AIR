-- 077_job_handovers.sql — ใบส่งมอบงาน filled in by the technician (in-app), optionally linked to a job.
-- One handover = a header (customer + work-type + signatures) + a list of sub-forms (jsonb):
--   { kind:'perf', machine:{...}, rows:[{b,a}×14], note }   — การวัดประสิทธิภาพ (ก่อน/หลัง)
--   { kind:'pm',   machine:{...}, rows:['done'|'not'|null ×15], note }  — งานล้าง/PM checklist
-- Multiple machines → multiple forms; technicians press "+ เพิ่มแบบฟอร์ม" to add one.

create table if not exists job_handovers (
  id            uuid primary key default gen_random_uuid(),
  job_no        text references job_orders(job_no) on delete set null,  -- optional link (เลือกไม่ผูกก็ได้)
  customer_id   bigint references customers(id) on delete set null,
  customer_name text,
  contact_name  text, contact_phone text, address text,
  doc_ref       text,                       -- เอกสารอ้างอิง (เลขใบเสนอราคา ฯลฯ)
  doc_date      date default current_date,
  work_types    text[] default '{}',        -- install/maintenance/repair/move/survey_install/survey_repair/other
  detail        text,                        -- รายละเอียด/อาการเสีย/การสำรวจหน้างาน
  fix_note      text,                        -- การแก้ไข/หมายเหตุอื่น ๆ
  forms         jsonb not null default '[]', -- array of sub-forms (see header)
  tech_sign_url text, tech_name text,        -- ลายเซ็นช่าง (วาดบนจอ → PNG ใน storage)
  cust_sign_url text, cust_name text,        -- ลายเซ็นลูกค้า
  status        text not null default 'draft' check (status in ('draft','submitted')),
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_job_handovers_job on job_handovers(job_no);
create index if not exists idx_job_handovers_by  on job_handovers(created_by, created_at desc);

alter table job_handovers enable row level security;
-- ช่างจัดการของตัวเอง; ออฟฟิศ + หัวหน้าช่าง เห็น/จัดการได้ทั้งหมด
drop policy if exists job_handovers_rw on job_handovers;
create policy job_handovers_rw on job_handovers for all
  using (created_by = auth.uid() or my_role() in ('admin','exec','sales','finance','lead_tech'))
  with check (created_by = auth.uid() or my_role() in ('admin','exec','sales','finance','lead_tech'));
