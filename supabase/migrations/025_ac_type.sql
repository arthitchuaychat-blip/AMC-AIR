-- เพิ่มหมวดย่อย "ประเภทแอร์" (Wall/Cassette/Ceiling/Duct/Floor ฯลฯ) ให้สินค้าแอร์
-- ⚠️ ต้อง DROP+CREATE view material_stock ใหม่ เพราะ view ใช้ select m.* (ไม่งั้นแอปจะไม่เห็นคอลัมน์ใหม่)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table materials add column if not exists ac_type text;

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
