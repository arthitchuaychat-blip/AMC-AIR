-- 109_material_prep.sql — ใบเตรียมวัสดุ (ก่อนสั่งซื้อ/เบิก) + เปิดสิทธิ์ฝ่ายขายสร้างใบสั่งซื้อ
-- ขั้นตอน: สร้างใบเตรียมวัสดุ (ดึงรายการจากใบเสนอราคา/เพิ่มเอง · แบ่งจำนวน ซื้อ/เบิก ต่อรายการ)
--          → ธุรการ/ผู้บริหารอนุมัติ → แตกเป็นใบสั่งซื้อ (ร่าง) + ใบเบิก (ร่าง) ดำเนินการต่อตามกระบวนการเดิม
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists material_preps (
  prep_no     text primary key,
  quote_no    text,                    -- อ้างอิงใบเสนอราคา (ไม่บังคับ)
  title       text,
  note        text,
  status      text not null default 'draft' check (status in ('draft','approved','done','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create table if not exists material_prep_items (
  id            bigint generated always as identity primary key,
  prep_no       text not null references material_preps(prep_no) on delete cascade,
  material_code text,
  name          text,
  unit          text,
  qty_buy       numeric not null default 0,   -- จำนวนที่สั่งซื้อ
  qty_withdraw  numeric not null default 0    -- จำนวนที่เบิกจากคลัง
);

alter table material_preps enable row level security;
alter table material_prep_items enable row level security;
drop policy if exists prep_read on material_preps;
create policy prep_read on material_preps for select to authenticated using (true);
drop policy if exists prep_write on material_preps;
create policy prep_write on material_preps for all to authenticated
  using (my_role() in ('admin', 'exec', 'finance', 'sales', 'stock', 'hr'))
  with check (my_role() in ('admin', 'exec', 'finance', 'sales', 'stock', 'hr'));
drop policy if exists prepi_read on material_prep_items;
create policy prepi_read on material_prep_items for select to authenticated using (true);
drop policy if exists prepi_write on material_prep_items;
create policy prepi_write on material_prep_items for all to authenticated
  using (my_role() in ('admin', 'exec', 'finance', 'sales', 'stock', 'hr'))
  with check (my_role() in ('admin', 'exec', 'finance', 'sales', 'stock', 'hr'));

-- ผู้มีอำนาจสั่งซื้อ: ธุรการวัสดุ + ฝ่ายขาย + ตำแหน่งเหนือกว่า (เพิ่ม sales/hr จากชุดเดิม)
drop policy if exists po_write on purchase_orders;
create policy po_write on purchase_orders for all to authenticated
  using (my_role() in ('admin', 'exec', 'finance', 'stock', 'sales', 'hr'))
  with check (my_role() in ('admin', 'exec', 'finance', 'stock', 'sales', 'hr'));
drop policy if exists poi_write on po_items;
create policy poi_write on po_items for all to authenticated
  using (my_role() in ('admin', 'exec', 'finance', 'stock', 'sales', 'hr'))
  with check (my_role() in ('admin', 'exec', 'finance', 'stock', 'sales', 'hr'));

-- ✅ ตรวจผล
select polname, pg_get_expr(polwithcheck, polrelid) as เงื่อนไขเขียน
from pg_policy where polrelid in ('material_preps'::regclass, 'purchase_orders'::regclass);
