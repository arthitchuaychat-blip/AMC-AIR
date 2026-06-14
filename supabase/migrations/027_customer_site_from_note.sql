-- 027 · ย้ายลิงก์แผนที่ที่ค้างอยู่ในช่อง "หมายเหตุ" (note) ของลูกค้าที่นำเข้า
--      ไปไว้ที่ customer_sites.map_url และตั้งชื่อไซต์ตามประเภทลูกค้า
--      นิติบุคคล → "สำนักงาน" · บุคคลธรรมดา → "บ้าน"
-- รันครั้งเดียวใน Supabase SQL Editor (ปลอดภัยถ้ารันซ้ำ: ข้ามรายที่มีไซต์อยู่แล้ว)

insert into customer_sites (customer_id, site_name, address, map_url)
select c.id,
       case when c.type = 'company' then 'สำนักงาน' else 'บ้าน' end,
       c.address,
       substring(c.note from 'https?://\S+')          -- ดึงเฉพาะ URL (ตัด whitespace/ตัวอักษรนำหน้า)
from customers c
where c.note ~ 'https?://'
  and not exists (select 1 from customer_sites s where s.customer_id = c.id);

-- ล้างหมายเหตุที่เป็นลิงก์แผนที่ออก (เพราะย้ายไปไซต์แล้ว)
update customers
set note = null
where note ~ 'https?://';
