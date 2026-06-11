-- ============================================================
-- วัสดุOS — Supabase / Postgres schema + seed data + RLS
-- วางทั้งไฟล์นี้ใน Supabase → SQL Editor → Run
-- ============================================================

-- ---------- TABLES ----------
create table if not exists categories (
  id       text primary key,
  name_th  text not null,
  name_en  text,
  color    text
);

create table if not exists teams (
  id     text primary key,
  name   text not null,
  lead   text
);

create table if not exists materials (
  code        text primary key,
  name_th     text not null,
  name_en     text,
  category    text references categories(id) on update cascade,
  unit        text,
  cost        numeric not null default 0,
  sale_price  numeric not null default 0,
  description text,
  min_stock   numeric not null default 0,
  init_stock  numeric not null default 0,   -- ยอดคงเหลือ ณ วันเริ่มใช้ระบบ
  photo_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- โปรไฟล์ผู้ใช้ + บทบาท (ผูกกับ auth.users ของ Supabase)
create table if not exists profiles (
  id     uuid primary key references auth.users(id) on delete cascade,
  email  text,
  name   text,
  role   text not null default 'tech' check (role in ('exec','admin','sales','tech')),
  team   text references teams(id)
);

-- ธุรกรรมทั้งหมด: เบิก / คืน / ซื้อเข้า / ตัดเสีย
create table if not exists transactions (
  id            bigint generated always as identity primary key,
  txn_date      date not null default current_date,
  type          text not null check (type in ('withdraw','return','purchase','damage')),
  job_no        text,
  team          text references teams(id),
  material_code text not null references materials(code),
  qty           numeric not null check (qty > 0),
  unit_cost     numeric not null default 0,
  value         numeric generated always as (qty * unit_cost) stored,
  reason        text,
  photo_url     text,
  recorded_by   uuid references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists idx_txn_material on transactions(material_code);
create index if not exists idx_txn_date on transactions(txn_date);

-- ---------- งาน (Job costing) ----------
create table if not exists jobs (
  job_no     text primary key,
  team       text,
  status     text not null default 'open' check (status in ('open','closed')),
  used_value numeric,
  closed_at  timestamptz,
  closed_by  uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- CRM: ลูกค้า ----------
create table if not exists customers (
  id         bigint generated always as identity primary key,
  type       text not null default 'company' check (type in ('company','person')),
  name       text not null,
  address    text,
  tax_id     text,
  vat        boolean not null default true,
  note       text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create table if not exists customer_contacts (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  name text, phone text, role text
);
create table if not exists customer_sites (
  id          bigint generated always as identity primary key,
  customer_id bigint not null references customers(id) on delete cascade,
  site_name text, address text, map_url text
);

-- ---------- ใบสั่งซื้อ (Purchase Orders) ----------
create table if not exists purchase_orders (
  po_no       text primary key,
  supplier    text,
  status      text not null default 'open' check (status in ('open','received','cancelled')),
  note        text,
  created_at  timestamptz not null default now(),
  received_at timestamptz,
  created_by  uuid references auth.users(id)
);
create table if not exists po_items (
  id            bigint generated always as identity primary key,
  po_no         text not null references purchase_orders(po_no) on delete cascade,
  material_code text not null references materials(code),
  qty           numeric not null check (qty > 0),
  price         numeric not null default 0
);

-- ---------- VIEW: ยอดคงเหลือปัจจุบัน (คำนวณจากธุรกรรม) ----------
-- หมายเหตุ: "ตัดเสียในงาน" (มี job_no) ไม่หักสต๊อกคลัง เพราะของออกจากคลังตั้งแต่ตอนเบิกแล้ว
-- มีเฉพาะ "ตัดเสียในคลัง" (job_no ว่าง) ที่หักสต๊อก
create or replace view material_stock as
select
  m.*,
  m.init_stock
    + coalesce(sum(case when t.type in ('purchase','return') then t.qty else 0 end), 0)
    - coalesce(sum(case when t.type = 'withdraw' then t.qty else 0 end), 0)
    - coalesce(sum(case when t.type = 'damage' and t.job_no is null then t.qty else 0 end), 0) as current_stock
from materials m
left join transactions t on t.material_code = m.code
group by m.code;

alter view material_stock set (security_invoker = on);

-- ---------- SEED: หมวดวัสดุ ----------
insert into categories (id, name_th, name_en, color) values
 ('pipe','ท่อทองแดง','Copper Pipe','#2563eb'),
 ('fit','ข้อต่อ/ฟิตติ้ง','Fittings','#7c3aed'),
 ('ref','น้ำยาแอร์','Refrigerant','#0891b2'),
 ('ins','ฉนวน','Insulation','#d97706'),
 ('wire','สายไฟ','Wire / Cable','#ea580c'),
 ('elec','อุปกรณ์ไฟฟ้า','Electrical','#16a34a')
on conflict (id) do nothing;

-- ---------- SEED: ทีมช่าง ----------
insert into teams (id, name, lead) values
 ('ARM','Team ARM','อาร์ม'),
 ('KENG','Team KENG','เก่ง'),
 ('BOM','Team BOM','บอม'),
 ('PAT','Team PAT','แพท')
on conflict (id) do nothing;

-- ---------- SEED: วัสดุ 24 รายการ ----------
insert into materials (code, name_th, name_en, category, unit, cost, min_stock, init_stock) values
 ('COPP2','ท่อทองแดงแบบม้วน 1/4" (6.35mm)','Copper Coil 1/4"','pipe','เมตร',62,120,86),
 ('COPP3','ท่อทองแดงแบบม้วน 3/8" (9.52mm)','Copper Coil 3/8"','pipe','เมตร',95.33,100,142),
 ('COPP4','ท่อทองแดงแบบม้วน 1/2" (12.7mm)','Copper Coil 1/2"','pipe','เมตร',126,80,41),
 ('COPM4','ท่อทองแดง Type M 1/2"','Copper Pipe M 1/2"','pipe','เมตร',86.33,60,70),
 ('COPM6','ท่อทองแดง Type M 3/4"','Copper Pipe M 3/4"','pipe','เมตร',164.5,40,18),
 ('COP14','ข้อต่อตรงทองแดง 1/4"','Straight Coupling 1/4"','fit','ชิ้น',10,80,210),
 ('COP12','ข้อต่อตรงทองแดง 1/2"','Straight Coupling 1/2"','fit','ชิ้น',12,60,54),
 ('C4514','ข้องอ 45° 1/4"','Elbow 45° 1/4"','fit','ชิ้น',18,60,96),
 ('C9014','ข้องอ 90° 1/4"','Elbow 90° 1/4"','fit','ชิ้น',15,60,33),
 ('C9012','ข้องอ 90° 1/2"','Elbow 90° 1/2"','fit','ชิ้น',17,50,61),
 ('R32','น้ำยาแอร์ R32 (10kg)','Refrigerant R32','ref','ถัง',3500,5,3),
 ('R410','น้ำยาแอร์ R410A (11.3kg)','Refrigerant R410A','ref','ถัง',4200,4,6),
 ('INS14','ฉนวนยาง 1/4"','Rubber Insulation 1/4"','ins','เมตร',22,150,88),
 ('INS12','ฉนวนยาง 1/2"','Rubber Insulation 1/2"','ins','เมตร',28,120,165),
 ('THW25','สายไฟ THW 2.5','Wire THW 2.5','wire','เมตร',18,250,130),
 ('THW40','สายไฟ THW 4.0','Wire THW 4.0','wire','เมตร',28,200,240),
 ('VCT3','สายไฟ VCT 3×2.5','Cable VCT 3×2.5','wire','เมตร',45,120,58),
 ('BRK20','เบรกเกอร์ 20A','Breaker 20A','elec','ตัว',185,12,9),
 ('CAP35','คาปาซิเตอร์ 35µF','Capacitor 35µF','elec','ตัว',120,15,22),
 ('BKT','แท่นรองแอร์','AC Bracket','elec','ชุด',250,20,14),
 ('TAPE','เทปพันท่อ PVC','PVC Tape','ins','ม้วน',15,60,47),
 ('DRAIN','ท่อน้ำทิ้ง PVC','Drain Pipe PVC','pipe','เมตร',12,120,95),
 ('GAS','แก๊สเชื่อม','Brazing Gas','elec','กระป๋อง',320,8,5),
 ('SILVER','ลวดเชื่อมเงิน 5%','Silver Brazing Rod','elec','เส้น',95,30,41)
on conflict (code) do nothing;

-- ---------- AUTO-CREATE PROFILE ON SIGNUP ----------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email), 'tech')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- ROW LEVEL SECURITY ----------
alter table categories   enable row level security;
alter table teams        enable row level security;
alter table materials    enable row level security;
alter table transactions enable row level security;
alter table profiles     enable row level security;

-- helper: บทบาทของผู้ใช้ปัจจุบัน
create or replace function my_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function my_team() returns text language sql stable security definer set search_path = public as $$
  select team from public.profiles where id = auth.uid()
$$;

-- อ่านข้อมูลอ้างอิงได้ทุกคนที่ล็อกอิน
create policy cat_read  on categories for select to authenticated using (true);
create policy team_read on teams      for select to authenticated using (true);
create policy mat_read  on materials  for select to authenticated using (true);

-- แก้ไขวัสดุ: เฉพาะธุรการ (admin)
create policy mat_write on materials for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- โปรไฟล์: อ่านของตัวเอง / admin อ่านได้หมด
create policy prof_read on profiles for select to authenticated
  using (id = auth.uid() or my_role() in ('admin','exec'));
create policy prof_self on profiles for update to authenticated
  using (id = auth.uid());

-- ธุรกรรม: ช่างเห็น/บันทึกเฉพาะทีมตัวเอง · admin/exec เห็นหมด · admin บันทึกได้ทุกทีม
create policy txn_read on transactions for select to authenticated
  using (my_role() in ('admin','exec') or team = my_team());
create policy txn_insert on transactions for insert to authenticated
  with check (my_role() = 'admin' or (my_role() = 'tech' and team = my_team()));
create policy txn_admin_edit on transactions for update to authenticated
  using (my_role() = 'admin');

-- งาน: อ่านได้ทุกคนที่ล็อกอิน · ปิด/เปิดงาน เฉพาะธุรการ
alter table jobs enable row level security;
create policy jobs_read on jobs for select to authenticated using (true);
create policy jobs_write on jobs for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- ใบสั่งซื้อ: อ่านได้ทุกคนที่ล็อกอิน · สร้าง/แก้/ลบ เฉพาะธุรการ
alter table purchase_orders enable row level security;
alter table po_items enable row level security;
create policy po_read on purchase_orders for select to authenticated using (true);
create policy po_write on purchase_orders for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');
create policy poi_read on po_items for select to authenticated using (true);
create policy poi_write on po_items for all to authenticated
  using (my_role() = 'admin') with check (my_role() = 'admin');

-- ลูกค้า: อ่านได้ทุกคนที่ล็อกอิน · เพิ่ม/แก้/ลบ เฉพาะธุรการ + ฝ่ายขาย
alter table customers enable row level security;
alter table customer_contacts enable row level security;
alter table customer_sites enable row level security;
create policy cust_read on customers for select to authenticated using (true);
create policy cust_write on customers for all to authenticated using (my_role() in ('admin','sales')) with check (my_role() in ('admin','sales'));
create policy cc_read on customer_contacts for select to authenticated using (true);
create policy cc_write on customer_contacts for all to authenticated using (my_role() in ('admin','sales')) with check (my_role() in ('admin','sales'));
create policy cs_read on customer_sites for select to authenticated using (true);
create policy cs_write on customer_sites for all to authenticated using (my_role() in ('admin','sales')) with check (my_role() in ('admin','sales'));

-- ============================================================
-- หลังรันแล้ว: สร้างผู้ใช้ใน Authentication → ค่อยตั้ง role/team ใน profiles
-- เช่น: update profiles set role='admin' where email='admin@yourco.com';
-- และสร้าง Storage bucket ชื่อ "photos" (public) สำหรับรูปวัสดุ/ของเสีย
-- ============================================================
