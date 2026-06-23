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
  kind        text not null default 'material' check (kind in ('ac','service','material')),
  brand       text,
  btu         integer,
  ac_type     text,                       -- ประเภทแอร์ (Wall/Cassette/Ceiling/Duct/Floor) — เฉพาะสินค้าแอร์

  tracked     boolean not null default true,
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
  role   text not null default 'tech' check (role in ('exec','admin','finance','sales','stock','lead_tech','tech')),
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

-- ---------- ใบงาน (Job Orders) ----------
create table if not exists job_orders (
  job_no        text primary key,
  quote_no      text references quotations(quote_no) on delete set null,
  customer_id   bigint references customers(id) on delete set null,
  site_id       bigint references customer_sites(id) on delete set null,
  title         text,
  group_no      text,                             -- ใบงานเชื่อม: ใบในกลุ่มเดียวกันใช้ค่านี้ร่วม (= เลขใบราก)
  job_type      text not null default 'install',  -- survey/install/repair/maintenance/other
  contact_name  text, contact_phone text,
  address       text, map_url text, details text,
  sales_note    text,
  sales_photos  text[] default '{}',
  assigned_team text references teams(id),
  scheduled_at  timestamptz,
  end_date      date,                       -- วันสิ้นสุด (งานหลายวัน) · ว่าง = งานวันเดียว
  slot          text check (slot is null or slot in ('morning','afternoon','full','custom')),
  status        text not null default 'pending' check (status in ('quote_pending','pending','scheduled','in_progress','awaiting_approval','reschedule','done','cancelled')),
  completion_note text,
  photos        text[] default '{}',
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);

-- รอบเข้างาน · 1 ใบงานมีได้หลายรอบ (วัน/รอบเวลา/ทีม ต่างกันได้)
create table if not exists job_visits (
  id            bigint generated always as identity primary key,
  job_no        text not null references job_orders(job_no) on delete cascade,
  visit_date    date not null,
  end_date      date,
  slot          text check (slot is null or slot in ('morning','afternoon','full','custom')),
  scheduled_at  timestamptz,
  assigned_team text references teams(id),
  status        text not null default 'scheduled' check (status in ('pending','scheduled','in_progress','awaiting_approval','reschedule','done','cancelled')),
  note          text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id)
);
create index if not exists idx_job_visits_job on job_visits(job_no);
create index if not exists idx_job_visits_date on job_visits(visit_date);

-- ---------- ข้อมูลบริษัท (หัวเอกสาร 2 ชุด · id=1 มี VAT, id=2 ไม่มี VAT) ----------
create table if not exists company_profile (
  id            int primary key,
  name          text, branch text, address text, tax_id text,
  phone         text, email text, website text,
  bank_info     text, default_terms text, logo_url text,
  updated_at    timestamptz default now(),
  constraint company_id_check check (id in (1, 2))
);
insert into company_profile (id) values (1), (2) on conflict (id) do nothing;

-- ---------- ใบแจ้งหนี้ (แบ่งงวด) + ใบเสร็จรับเงิน ----------
create table if not exists invoices (
  invoice_no   text primary key,
  quote_no     text references quotations(quote_no) on delete set null,
  boq_no       text,
  customer_id  bigint references customers(id) on delete set null,
  site_id      bigint references customer_sites(id) on delete set null,
  issue_date   date, due_date date, installment int, pct numeric,
  base numeric, vat_amt numeric, total numeric, wht_amt numeric, wht_rate numeric not null default 3,
  items jsonb default '[]',
  note text,
  terms_payment text, terms_freebies text, terms_warranty text,
  status       text not null default 'unpaid' check (status in ('unpaid','paid','cancelled')),
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);
create table if not exists receipts (
  receipt_no   text primary key,
  invoice_no   text references invoices(invoice_no) on delete set null,
  quote_no     text references quotations(quote_no) on delete set null,
  boq_no       text,
  job_no       text references job_orders(job_no) on delete set null,
  customer_id  bigint references customers(id) on delete set null,
  site_id      bigint references customer_sites(id) on delete set null,
  issue_date   date, payment_method text,
  base numeric, vat_amt numeric, total numeric, wht_amt numeric, net numeric,
  wht boolean not null default false, wht_rate numeric not null default 3,
  items jsonb default '[]',
  status       text not null default 'paid' check (status in ('pending','paid')),
  note text,
  terms_payment text, terms_freebies text, terms_warranty text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id)
);

-- ---------- ความเคลื่อนไหวของใบงาน (timeline: เปลี่ยนสถานะ + แนบรูป/คอมเมนต์ไม่จำกัด) ----------
create table if not exists job_logs (
  id         bigint generated always as identity primary key,
  job_no     text not null references job_orders(job_no) on delete cascade,
  type       text not null default 'update' check (type in ('update','status')),
  status     text,
  note       text,
  photos     text[] default '{}',
  author     text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create index if not exists idx_job_logs_job on job_logs(job_no, created_at);

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

-- ---------- ทะเบียนยี่ห้อ + ขนาด BTU (สำหรับสินค้าแอร์) ----------
create table if not exists brands (name text primary key);
create table if not exists btus (btu integer primary key);

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
  site_name text, address text, map_url text,
  contact_name text, phone text
);

-- ---------- BOQ (ใบประมาณการต้นทุน) ----------
create table if not exists boqs (
  boq_no      text primary key,
  customer_id bigint references customers(id) on delete set null,
  site_id     bigint references customer_sites(id) on delete set null,
  title       text,
  note        text,
  terms_payment text, terms_freebies text, terms_warranty text,
  status      text not null default 'open',
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id)
);
create table if not exists boq_items (
  id        bigint generated always as identity primary key,
  boq_no    text not null references boqs(boq_no) on delete cascade,
  section   text not null check (section in ('ac','free','charged','service')),
  item_code text references materials(code) on delete set null,
  name      text, unit text,
  description text,
  qty       numeric not null default 0,
  unit_cost numeric not null default 0
);

-- ---------- ใบเสนอราคา (Quotations) ----------
create table if not exists quotations (
  quote_no       text primary key,
  customer_id    bigint references customers(id) on delete set null,
  site_id        bigint references customer_sites(id) on delete set null,
  boq_no         text references boqs(boq_no) on delete set null,
  title          text,
  status         text not null default 'draft' check (status in ('draft','sent','approved','rejected','expired')),
  issue_date     date,
  valid_until    date,
  discount_type  text not null default 'amount' check (discount_type in ('amount','percent')),
  discount_value numeric not null default 0,
  vat            boolean not null default true,
  wht            boolean not null default false,
  wht_rate       numeric not null default 3,
  note           text,
  terms_payment text, terms_freebies text, terms_warranty text,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id)
);
create table if not exists quotation_items (
  id         bigint generated always as identity primary key,
  quote_no   text not null references quotations(quote_no) on delete cascade,
  item_code  text references materials(code) on delete set null,
  name       text, kind text, unit text,
  description text,
  qty        numeric not null default 0,
  unit_price numeric not null default 0
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
-- ⚠️ view ใช้ select m.* — ถ้าเพิ่มคอลัมน์ใหม่ใน materials ภายหลัง ต้อง DROP+CREATE view นี้ใหม่
--    (create or replace อาจไม่อัปเดตคอลัมน์ใหม่ที่แทรกกลางลำดับ) ไม่งั้นแอปจะไม่เห็นคอลัมน์ใหม่
drop view if exists material_stock cascade;
create view material_stock as
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
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));

-- โปรไฟล์: อ่านได้ทุกคน · แก้ของตัวเอง · ผู้บริหาร/ธุรการจัดการผู้ใช้ได้ทั้งหมด
create policy prof_read on profiles for select to authenticated
  using (true);
create policy prof_self on profiles for update to authenticated
  using (id = auth.uid());
create policy prof_mgr_update on profiles for update to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
create policy prof_mgr_insert on profiles for insert to authenticated
  with check (my_role() in ('admin','exec','finance') or id = auth.uid());

-- ธุรกรรม: ช่างเห็น/บันทึกเฉพาะทีมตัวเอง · admin/exec เห็นหมด+บันทึกได้ทุกทีม
create policy txn_read on transactions for select to authenticated
  using (my_role() in ('admin','exec','finance','stock','lead_tech') or team = my_team());
create policy txn_insert on transactions for insert to authenticated
  with check (
    my_role() in ('admin','exec','finance','stock')
    or (my_role() = 'tech' and team = my_team() and type in ('withdraw','return'))
    or (my_role() = 'lead_tech' and type in ('withdraw','return'))
  );
create policy txn_admin_edit on transactions for update to authenticated
  using (my_role() in ('admin','exec','finance','stock'));

-- งาน: อ่านได้ทุกคนที่ล็อกอิน · ปิด/เปิดงาน เฉพาะธุรการ/ผู้บริหาร
alter table jobs enable row level security;
create policy jobs_read on jobs for select to authenticated using (true);
create policy jobs_write on jobs for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));

-- ใบสั่งซื้อ: อ่านได้ทุกคนที่ล็อกอิน · สร้าง/แก้/ลบ เฉพาะธุรการ/ผู้บริหาร
alter table purchase_orders enable row level security;
alter table po_items enable row level security;
create policy po_read on purchase_orders for select to authenticated using (true);
create policy po_write on purchase_orders for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));
create policy poi_read on po_items for select to authenticated using (true);
create policy poi_write on po_items for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));

-- ลูกค้า: อ่านได้ทุกคนที่ล็อกอิน · เพิ่ม/แก้/ลบ ธุรการ + ฝ่ายขาย + ผู้บริหาร
alter table customers enable row level security;
alter table customer_contacts enable row level security;
alter table customer_sites enable row level security;
create policy cust_read on customers for select to authenticated using (true);
create policy cust_write on customers for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy cc_read on customer_contacts for select to authenticated using (true);
create policy cc_write on customer_contacts for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy cs_read on customer_sites for select to authenticated using (true);
create policy cs_write on customer_sites for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ทะเบียนยี่ห้อ/BTU: อ่านได้ทุกคน · แก้ไขธุรการ+ฝ่ายขาย+ผู้บริหาร
alter table brands enable row level security;
alter table btus enable row level security;
create policy brands_read on brands for select to authenticated using (true);
create policy brands_write on brands for all to authenticated using (my_role() in ('admin','sales','exec','finance','stock')) with check (my_role() in ('admin','sales','exec','finance','stock'));
create policy btus_read on btus for select to authenticated using (true);
create policy btus_write on btus for all to authenticated using (my_role() in ('admin','sales','exec','finance','stock')) with check (my_role() in ('admin','sales','exec','finance','stock'));

-- BOQ: อ่านได้ทุกคน · แก้ไขธุรการ+ฝ่ายขาย+ผู้บริหาร
alter table boqs enable row level security;
alter table boq_items enable row level security;
create policy boq_read on boqs for select to authenticated using (true);
create policy boq_write on boqs for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy boqi_read on boq_items for select to authenticated using (true);
create policy boqi_write on boq_items for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ใบเสนอราคา: อ่านได้ทุกคน · แก้ไขธุรการ+ฝ่ายขาย+ผู้บริหาร
alter table quotations enable row level security;
alter table quotation_items enable row level security;
create policy qt_read on quotations for select to authenticated using (true);
create policy qt_write on quotations for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy qti_read on quotation_items for select to authenticated using (true);
create policy qti_write on quotation_items for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ใบงาน: อ่านได้ทุกคน · สร้าง/แก้/ลบ ธุรการ+ฝ่ายขาย+ผู้บริหาร · ช่างอัปเดตสถานะงานของทีมตัวเองได้
alter table job_orders enable row level security;
create policy jo_read on job_orders for select to authenticated using (true);
create policy jo_write on job_orders for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy jo_tech_update on job_orders for update to authenticated using (my_role() = 'tech' and assigned_team = my_team()) with check (my_role() = 'tech' and assigned_team = my_team());
-- หัวหน้าช่าง: อัปเดตสถานะงานได้ทุกทีม
create policy jo_lead_update on job_orders for update to authenticated using (my_role() = 'lead_tech') with check (my_role() = 'lead_tech');
alter table job_visits enable row level security;
create policy jv_read on job_visits for select to authenticated using (true);
create policy jv_write on job_visits for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy jv_tech_update on job_visits for update to authenticated using (my_role() = 'tech' and assigned_team = my_team()) with check (my_role() = 'tech' and assigned_team = my_team());
create policy jv_lead_update on job_visits for update to authenticated using (my_role() = 'lead_tech') with check (my_role() = 'lead_tech');

alter table job_logs enable row level security;
-- ทุกบทบาทที่ล็อกอินดูความเคลื่อนไหวได้
create policy jl_read on job_logs for select to authenticated using (true);
-- โพสต์ลง timeline ได้: พนักงานทุกคนที่ล็อกอิน (เป็น log แบบเพิ่มอย่างเดียว ทุกคนอ่านได้อยู่แล้ว)
create policy jl_insert on job_logs for insert to authenticated with check (
  my_role() in ('admin','sales','exec','finance','stock','lead_tech','tech')
);

-- ข้อมูลบริษัท: อ่านได้ทุกคน · แก้ไขธุรการ/ผู้บริหาร/บัญชี
alter table company_profile enable row level security;
create policy company_read on company_profile for select to authenticated using (true);
create policy company_write on company_profile for all to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));

-- ใบแจ้งหนี้ / ใบเสร็จ: อ่านได้ทุกคน · แก้ไขธุรการ/เซล/ผู้บริหาร/บัญชี
alter table invoices enable row level security;
alter table receipts enable row level security;
create policy inv_read on invoices for select to authenticated using (true);
create policy inv_write on invoices for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy rc_read on receipts for select to authenticated using (true);
create policy rc_write on receipts for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ---------- กระดานแชต LINE OA ----------
create table if not exists line_contacts (
  line_user_id    text primary key,
  display_name    text,
  picture_url     text,
  customer_id     bigint references customers(id) on delete set null,
  last_message    text,
  last_message_at timestamptz,
  unread          int not null default 0,
  stage           text default 'new',                       -- CRM phase: new/talking/interested/followup/won/closed/lost
  assigned_to     uuid references auth.users(id) on delete set null,  -- staff responsible
  created_at      timestamptz not null default now()
);
create table if not exists line_messages (
  id              bigint generated always as identity primary key,
  line_user_id    text not null references line_contacts(line_user_id) on delete cascade,
  direction       text not null check (direction in ('in','out')),
  type            text not null default 'text',
  text            text,
  image_url       text,
  file_url        text,
  file_name       text,
  line_message_id text,
  sent_by         uuid references auth.users(id),
  created_at      timestamptz not null default now()
);
create index if not exists idx_line_msg_user on line_messages(line_user_id, created_at);
create or replace function line_bump_unread(p_uid text, p_msg text)
returns void language sql security definer set search_path = public as $$
  update line_contacts set unread = unread + 1, last_message = p_msg, last_message_at = now()
  where line_user_id = p_uid;
$$;
alter table line_contacts enable row level security;
alter table line_messages enable row level security;
create policy lc_read on line_contacts for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','lead_tech'));
create policy lc_update on line_contacts for update to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
create policy lm_read on line_messages for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','lead_tech'));
alter publication supabase_realtime add table line_messages;
alter publication supabase_realtime add table line_contacts;

-- ---------- ข้อความตอบกลับสำเร็จรูป (quick replies) ----------
create table if not exists quick_replies (
  id         bigint generated always as identity primary key,
  title      text,
  text       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
alter table quick_replies enable row level security;
create policy qr_read on quick_replies for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','lead_tech'));
create policy qr_write on quick_replies for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ---------- คลังแบบมาตรฐานของเงื่อนไขท้ายเอกสาร (doc term presets) ----------
create table if not exists doc_term_presets (
  id         bigint generated always as identity primary key,
  category   text not null check (category in ('payment','freebies','warranty')),
  title      text not null,
  body       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
alter table doc_term_presets enable row level security;
create policy dtp_read  on doc_term_presets for select to authenticated using (true);
create policy dtp_write on doc_term_presets for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ---------- แชตภายในองค์กร (team chat) — see migration 037 for full RLS ----------
create table if not exists chat_rooms (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('company','dm','group','project')),
  name text, ref_type text, ref_no text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists chat_members (
  room_id bigint not null references chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz, created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table if not exists chat_messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references chat_rooms(id) on delete cascade,
  sender uuid references auth.users(id) on delete set null,
  text text, image_url text, file_url text, file_name text, created_at timestamptz not null default now()
);
-- (RLS policies + chat_is_member() helper + seed company room: see migration 037_team_chat.sql)

-- ============================================================
-- หลังรันแล้ว: สร้างผู้ใช้ใน Authentication → ค่อยตั้ง role/team ใน profiles
-- เช่น: update profiles set role='admin' where email='admin@yourco.com';
-- และสร้าง Storage bucket ชื่อ "photos" (public) สำหรับรูปวัสดุ/ของเสีย
-- ============================================================
