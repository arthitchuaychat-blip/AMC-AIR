-- หัวกระดาษ 2 ชุด: id=1 = แบบมี VAT · id=2 = แบบไม่มี VAT (แยกบัญชีธนาคารกันได้)
-- รันใน Supabase → SQL Editor (ครั้งเดียว) — รันได้แม้ยังไม่เคยรัน 014
create table if not exists company_profile (
  id            int primary key,
  name          text, branch text, address text, tax_id text,
  phone         text, email text, website text,
  bank_info     text, default_terms text, logo_url text,
  updated_at    timestamptz default now()
);

-- เปลี่ยนจาก "แถวเดียว id=1" เป็นรองรับ id 1,2
alter table company_profile drop constraint if exists company_singleton;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'company_id_check') then
    alter table company_profile add constraint company_id_check check (id in (1, 2));
  end if;
end $$;

insert into company_profile (id) values (1), (2) on conflict (id) do nothing;

-- RLS (เผื่อเป็นการสร้างตารางใหม่)
alter table company_profile enable row level security;
drop policy if exists company_read on company_profile;
create policy company_read on company_profile for select to authenticated using (true);
drop policy if exists company_write on company_profile;
create policy company_write on company_profile for all to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
