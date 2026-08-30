-- 235: ประวัติพนักงาน + เอกสาร (แยกจาก profiles/hr_pay — เป็นข้อมูลส่วนบุคคล/เอกสาร HR)
create table if not exists hr_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  nickname text,
  phone text,
  address text,
  birth_date date,
  emergency_name text,          -- ผู้ติดต่อฉุกเฉิน
  emergency_phone text,
  bank_name text,               -- ธนาคาร + เลขบัญชี (จ่ายเงินเดือน)
  bank_account text,
  position_title text,          -- ชื่อตำแหน่งตามสัญญา (ต่างจาก role ในระบบได้)
  note text,
  documents jsonb not null default '[]'::jsonb,   -- เอกสาร [{name, url}] เช่น สัญญาจ้าง/สำเนาบัตร/วุฒิ
  updated_at timestamptz default now()
);
comment on table hr_profiles is 'ประวัติพนักงาน + เอกสาร HR — PII แยกจาก profiles · อ่านได้เฉพาะเจ้าของ + admin/exec/hr';

alter table hr_profiles enable row level security;
-- เจ้าของอ่านของตัวเองได้ · ผู้จัดการ (ธุรการ/ผู้บริหาร/บุคคล) อ่าน-เขียนได้ทุกคน
drop policy if exists hr_profiles_read on hr_profiles;
create policy hr_profiles_read on hr_profiles for select
  using (user_id = auth.uid() or my_role() in ('admin','exec','hr'));
drop policy if exists hr_profiles_write on hr_profiles;
create policy hr_profiles_write on hr_profiles for all
  using (my_role() in ('admin','exec','hr'))
  with check (my_role() in ('admin','exec','hr'));
