-- 104_service_cat_remove.sql — เพิ่มหมวดบริการ "รื้อถอน" + ย้ายงานรื้อถอนออกจาก "อื่นๆ"
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

insert into categories (id, name_th, name_en, color) values
  ('sv-remove', 'รื้อถอน', 'Removal', '#9333ea')
on conflict (id) do nothing;

-- งานที่ชื่อมีคำว่า "รื้อ" (รื้อถอน/รื้อแอร์) ที่ตอนนี้อยู่ อื่นๆ หรือยังไม่มีหมวด → ย้ายมา รื้อถอน
update materials set category = 'sv-remove'
where kind = 'service'
  and (name_th ilike '%รื้อ%' or name_en ilike '%รื้อ%' or name_en ilike '%removal%' or name_en ilike '%dismant%')
  and (coalesce(category, '') not like 'sv-%' or category = 'sv-other');

-- ✅ ตรวจผล
select code, name_th from materials where kind = 'service' and category = 'sv-remove' order by code;
select c.name_th as หมวด, count(*) as จำนวน
from materials m left join categories c on c.id = m.category
where m.kind = 'service' group by 1 order by 2 desc;
