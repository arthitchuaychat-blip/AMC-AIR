-- เอกสารครบถ้วน: ข้อมูลบริษัท (หัวเอกสาร) + หัก ณ ที่จ่ายในใบเสนอราคา
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- หัก ณ ที่จ่าย (withholding tax) ในใบเสนอราคา
alter table quotations add column if not exists wht boolean not null default false;
alter table quotations add column if not exists wht_rate numeric not null default 3;

-- ข้อมูลบริษัทสำหรับหัวเอกสาร (แถวเดียว id=1)
create table if not exists company_profile (
  id            int primary key default 1,
  name          text, branch text, address text, tax_id text,
  phone         text, email text, website text,
  bank_info     text, default_terms text, logo_url text,
  updated_at    timestamptz default now(),
  constraint company_singleton check (id = 1)
);
insert into company_profile (id) values (1) on conflict (id) do nothing;

alter table company_profile enable row level security;
drop policy if exists company_read on company_profile;
create policy company_read on company_profile for select to authenticated using (true);
drop policy if exists company_write on company_profile;
create policy company_write on company_profile for all to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
