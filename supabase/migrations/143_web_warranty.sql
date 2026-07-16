-- 143: เว็บไซต์แสดงข้อมูลการรับประกัน — เพิ่มคอลัมน์ warranty (mig 140) เข้า view สาธารณะ web_products
-- (view ระบุคอลัมน์ตายตัว จึงต้อง drop + สร้างใหม่ แล้วให้สิทธิ์ anon เหมือนเดิม)
drop view if exists web_products;
create view web_products as
  select code, name_th, name_en, kind, brand, btu, ac_type, unit,
         sale_price, description, photo_url, power_cost_year, features, category, btu_min, btu_max,
         series, voltage, refrigerant, seer, pipe_size, energy_label, warranty
  from materials
  where web_published = true and coalesce(active, true) = true;
grant select on web_products to anon, authenticated;

-- ✅ ตรวจผล: รุ่นที่เผยแพร่บนเว็บพร้อมข้อความรับประกัน
select code, name_th, warranty from web_products where kind = 'ac' limit 10;
