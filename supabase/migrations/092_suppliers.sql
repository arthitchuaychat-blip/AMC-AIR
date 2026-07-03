-- 092_suppliers.sql — ข้อมูลผู้ขาย (Suppliers/Vendors) โครงเดียวกับลูกค้า · รันครั้งเดียว
-- ผู้ขาย + ผู้ติดต่อหลายคน + สาขา/ที่ตั้งหลายที่

create table if not exists suppliers (
  id         bigint generated always as identity primary key,
  type       text not null default 'company' check (type in ('company','person')),
  name       text not null,
  address    text,
  tax_id     text,
  email      text,
  vat        boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create table if not exists supplier_contacts (
  id          bigint generated always as identity primary key,
  supplier_id bigint not null references suppliers(id) on delete cascade,
  name text, phone text, role text
);
create table if not exists supplier_sites (
  id          bigint generated always as identity primary key,
  supplier_id bigint not null references suppliers(id) on delete cascade,
  site_name text, address text, map_url text,
  contact_name text, phone text
);

alter table suppliers          enable row level security;
alter table supplier_contacts  enable row level security;
alter table supplier_sites     enable row level security;

-- read: any signed-in user (name pickers) · write: office/purchasing (admin/exec/finance/stock)
drop policy if exists sup_read on suppliers;
create policy sup_read on suppliers for select to authenticated using (true);
drop policy if exists sup_write on suppliers;
create policy sup_write on suppliers for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));

drop policy if exists supc_read on supplier_contacts;
create policy supc_read on supplier_contacts for select to authenticated using (true);
drop policy if exists supc_write on supplier_contacts;
create policy supc_write on supplier_contacts for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));

drop policy if exists sups_read on supplier_sites;
create policy sups_read on supplier_sites for select to authenticated using (true);
drop policy if exists sups_write on supplier_sites;
create policy sups_write on supplier_sites for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));
