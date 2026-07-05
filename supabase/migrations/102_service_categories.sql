-- 102_service_categories.sql — หมวดค่าบริการ (ติดตั้ง/ล้าง/ย้าย/ซ่อม/อื่นๆ) + ตัวกรอง
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- 1) หมวดบริการ 5 หมวด (id คงที่ sv-* — โค้ดทั้งแอปและเว็บอ้างอิงชุดนี้)
insert into categories (id, name_th, name_en, color) values
  ('sv-install', 'ติดตั้ง', 'Install',  '#0ea5e9'),
  ('sv-clean',   'ล้าง',    'Cleaning', '#16a34a'),
  ('sv-move',    'ย้าย',    'Relocate', '#f59e0b'),
  ('sv-repair',  'ซ่อม',    'Repair',   '#dc2626'),
  ('sv-other',   'อื่นๆ',   'Other',    '#64748b')
on conflict (id) do nothing;

-- 2) จัดหมวดค่าบริการที่มีอยู่แล้วอัตโนมัติจากชื่อ (แก้ทีหลังได้ในหน้าคลังสินค้า → แก้ไข)
update materials set category = 'sv-install' where kind = 'service' and coalesce(category,'') not like 'sv-%' and (name_th ilike '%ติดตั้ง%' or name_en ilike '%install%');
update materials set category = 'sv-clean'   where kind = 'service' and coalesce(category,'') not like 'sv-%' and (name_th ilike '%ล้าง%'   or name_en ilike '%clean%');
update materials set category = 'sv-move'    where kind = 'service' and coalesce(category,'') not like 'sv-%' and (name_th ilike '%ย้าย%'   or name_en ilike '%move%' or name_en ilike '%relocat%');
update materials set category = 'sv-repair'  where kind = 'service' and coalesce(category,'') not like 'sv-%' and (name_th ilike '%ซ่อม%'   or name_en ilike '%repair%');
update materials set category = 'sv-other'   where kind = 'service' and coalesce(category,'') not like 'sv-%';

-- 3) เปิดคอลัมน์ category บน view สินค้าเว็บ → เว็บ amcair.net กรองบริการตามหมวดจริงได้
drop view if exists web_products cascade;
create view web_products as
  select code, name_th, name_en, kind, brand, btu, ac_type, unit,
         sale_price, description, photo_url, power_cost_year, features, category
  from materials
  where web_published = true and coalesce(active, true) = true;
grant select on web_products to anon, authenticated;
