-- 071_website.sql — public company website (catalog + order request) wired to the back office.
-- รันใน Supabase → SQL Editor (ครั้งเดียว). ปลอดภัย: เว็บ public เห็นเฉพาะสินค้าที่เผยแพร่
-- (ไม่เห็นต้นทุน/ข้อมูลภายใน) และเขียนได้แค่ "คำสั่งซื้อจากเว็บ" เท่านั้น.

-- 1) ธงเลือกสินค้าที่จะโชว์บนเว็บ
alter table materials add column if not exists web_published boolean default false;

-- 1b) สร้าง view material_stock ใหม่ ให้รวมคอลัมน์ใหม่ (view เดิมใช้ m.* — ต้อง DROP+CREATE)
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

-- 2) view สินค้าสาธารณะ — เปิดเฉพาะคอลัมน์ที่ปลอดภัย (ไม่มี cost/ภายใน)
create or replace view web_products as
  select code, name_th, name_en, kind, brand, btu, ac_type, unit,
         sale_price, description, photo_url
  from materials
  where web_published = true and coalesce(active, true) = true;
grant select on web_products to anon, authenticated;

-- 3) คำสั่งซื้อ / ขอใบเสนอราคา จากเว็บ
create table if not exists web_orders (
  id          bigint generated always as identity primary key,
  name        text not null,
  phone       text not null,
  email       text,
  address     text,
  note        text,
  items       jsonb not null default '[]',   -- [{code,name,qty,price}]
  total       numeric not null default 0,
  status      text not null default 'new'
                check (status in ('new','contacted','quoted','done','cancelled')),
  customer_id bigint references customers(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table web_orders enable row level security;
grant insert on web_orders to anon;   -- ผู้เข้าชมเว็บ (ไม่ล็อกอิน) ส่งคำสั่งซื้อได้

-- ใครก็ส่งคำสั่งซื้อได้ (insert) ...
drop policy if exists web_orders_insert on web_orders;
create policy web_orders_insert on web_orders for insert to anon, authenticated with check (true);
-- ... แต่อ่าน/แก้ ได้เฉพาะฝ่ายออฟฟิศ
drop policy if exists web_orders_read on web_orders;
create policy web_orders_read on web_orders for select to authenticated
  using (my_role() in ('admin','sales','exec','finance'));
drop policy if exists web_orders_update on web_orders;
create policy web_orders_update on web_orders for update to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
drop policy if exists web_orders_delete on web_orders;
create policy web_orders_delete on web_orders for delete to authenticated
  using (my_role() in ('admin','exec'));

-- 4) คำสั่งซื้อใหม่ → เด้งกระดิ่งแจ้งเตือนหลังบ้าน (ใช้ระบบ notifications เดิม)
create or replace function notify_web_order() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, category, title, body, url, ref_type, ref_no)
  select id, 'web_order', '🛒 คำสั่งซื้อใหม่จากเว็บไซต์',
         coalesce(new.name, '') || ' · ' || coalesce(new.phone, ''),
         'weborders', 'weborder', new.id::text
  from profiles where role in ('admin', 'sales', 'exec');
  return new;
end $$;
drop trigger if exists trg_web_order on web_orders;
create trigger trg_web_order after insert on web_orders
  for each row execute function notify_web_order();
