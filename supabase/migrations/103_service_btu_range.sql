-- 103_service_btu_range.sql — ช่วง BTU ของงานบริการ (btu_min–btu_max) + เติมอัตโนมัติจากชื่อ
-- ตัวกรองจะฉลาดขึ้น: เลือก 20,000 BTU → เจอบริการช่วง 18,000–24,000
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table materials add column if not exists btu_min numeric;
alter table materials add column if not exists btu_max numeric;

-- 1) ชื่อที่มี "ช่วง" เช่น "18,000-24,000 BTU" → btu_min/btu_max
update materials set
  btu_min = replace((regexp_match(coalesce(name_th,'') || ' ' || coalesce(name_en,''), '([0-9][0-9,]*)\s*[-–—]\s*([0-9][0-9,]*)\s*BTU', 'i'))[1], ',', '')::numeric,
  btu_max = replace((regexp_match(coalesce(name_th,'') || ' ' || coalesce(name_en,''), '([0-9][0-9,]*)\s*[-–—]\s*([0-9][0-9,]*)\s*BTU', 'i'))[2], ',', '')::numeric
where kind = 'service' and btu_min is null
  and (coalesce(name_th,'') || ' ' || coalesce(name_en,'')) ~* '[0-9][0-9,]*\s*[-–—]\s*[0-9][0-9,]*\s*BTU';

-- 2) ชื่อที่มี BTU "ค่าเดียว" เช่น "12,000 BTU" → min = max
update materials set
  btu_min = replace((regexp_match(coalesce(name_th,'') || ' ' || coalesce(name_en,''), '([0-9][0-9,]*)\s*BTU', 'i'))[1], ',', '')::numeric,
  btu_max = replace((regexp_match(coalesce(name_th,'') || ' ' || coalesce(name_en,''), '([0-9][0-9,]*)\s*BTU', 'i'))[1], ',', '')::numeric
where kind = 'service' and btu_min is null
  and (coalesce(name_th,'') || ' ' || coalesce(name_en,'')) ~* '[0-9][0-9,]*\s*BTU';

-- 3) บริการที่เคยติดแท็ก BTU เดี่ยวไว้ (v291) → แปลงเป็นช่วงเดียว
update materials set btu_min = btu, btu_max = btu
where kind = 'service' and btu is not null and btu_min is null;

-- 4) view ต้องสร้างใหม่ให้เห็นคอลัมน์ใหม่ (นิยาม material_stock ยึดตัวล่าสุดจาก 086/098 — มี adjust_in/out)
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

drop view if exists web_products cascade;
create view web_products as
  select code, name_th, name_en, kind, brand, btu, ac_type, unit,
         sale_price, description, photo_url, power_cost_year, features, category, btu_min, btu_max
  from materials
  where web_published = true and coalesce(active, true) = true;
grant select on web_products to anon, authenticated;

-- ✅ ตรวจผล 1: บริการที่ได้ช่วง BTU แล้ว
select code, name_th, btu_min, btu_max from materials
where kind = 'service' and btu_min is not null order by btu_min, code limit 100;

-- ✅ ตรวจผล 2: บริการที่ยังไม่มีช่วง (ชื่อไม่มีตัวเลข BTU — ตั้งใจปล่อยว่าง = โผล่ทุกขนาด)
select code, name_th from materials where kind = 'service' and btu_min is null order by code;
