-- 247: ทะเบียนสินทรัพย์/ครุภัณฑ์ + คิดค่าเสื่อมราคา (เส้นตรง) — เครื่องมือช่างมูลค่าสูง ฯลฯ
create table if not exists fixed_assets (
  id            bigserial primary key,
  code          text,                               -- รหัสสินทรัพย์ (ออกเอง)
  name          text not null,
  category      text,                               -- เครื่องมือช่าง / ครุภัณฑ์สำนักงาน / ยานพาหนะ ...
  cost          numeric not null default 0,         -- ราคาซื้อ (ต้นทุน)
  salvage       numeric not null default 0,         -- มูลค่าซาก
  life_years    numeric not null default 5,         -- อายุการใช้งาน (ปี)
  purchase_date date,
  entity        text not null default 'company',    -- company | personal
  location      text,
  holder        text,                               -- ผู้ถือครอง/ผู้รับผิดชอบ
  supplier      text,
  expense_id    uuid,                               -- ผูกใบเบิกที่ซื้อ (ถ้ามี)
  note          text,
  disposed      boolean not null default false,     -- จำหน่าย/ตัดจำหน่ายแล้ว
  disposed_date date,
  active        boolean not null default true,
  created_by    uuid,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table fixed_assets enable row level security;
drop policy if exists asset_read on fixed_assets;
create policy asset_read on fixed_assets for select using (true);
drop policy if exists asset_write on fixed_assets;
create policy asset_write on fixed_assets for all
  using (my_role() in ('admin','exec','finance','hr'))
  with check (my_role() in ('admin','exec','finance','hr'));
