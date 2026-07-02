-- 087_product_web_fields.sql — เพิ่มช่อง "ประมาณค่าไฟ/ปี" + "คุณสมบัติสินค้า" ในสินค้า และโชว์บนเว็บ
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table materials add column if not exists power_cost_year numeric;   -- ประมาณค่าไฟ/ปี (บาท)
alter table materials add column if not exists features        text;      -- คุณสมบัติสินค้า (ข้อความยาว)

-- material_stock ใช้ m.* (ถูก freeze ตอนสร้าง) → ต้อง DROP+CREATE ใหม่ให้เห็นคอลัมน์ใหม่
drop view if exists material_stock cascade;
create view material_stock as
select
  m.*,
  m.init_stock
    + coalesce(sum(case when t.type in ('purchase','return','adjust_in') then t.qty else 0 end), 0)
    - coalesce(sum(case when t.type = 'withdraw' then t.qty else 0 end), 0)
    - coalesce(sum(case when t.type = 'damage' and t.job_no is null then t.qty else 0 end), 0)
    - coalesce(sum(case when t.type = 'adjust_out' then t.qty else 0 end), 0) as current_stock
from materials m
left join transactions t on t.material_code = m.code
group by m.code;
alter view material_stock set (security_invoker = on);

-- เปิดให้เว็บ public เห็น 2 ช่องใหม่ (view เห็นเฉพาะคอลัมน์ปลอดภัย ไม่มีต้นทุน/ภายใน)
drop view if exists web_products cascade;
create view web_products as
  select code, name_th, name_en, kind, brand, btu, ac_type, unit,
         sale_price, description, photo_url, power_cost_year, features
  from materials
  where web_published = true and coalesce(active, true) = true;
grant select on web_products to anon, authenticated;
