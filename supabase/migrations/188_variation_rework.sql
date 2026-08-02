-- 188: (1) ใบเสนอราคาเพิ่มเติม (variation) ผูกใบแม่ → กำไรรวมงานเดียว
--      (2) งานแก้ไข/เคลม ผูกใบงานต้นเรื่อง → KPI ตัดเคลมที่ทีมต้นเรื่อง ไม่ใช่ทีมที่ไปแก้
alter table quotations add column if not exists variation_of text references quotations(quote_no) on delete set null;  -- ใบเสนอเพิ่มเติม = อ้างใบเสนอแม่
alter table job_orders add column if not exists rework_of  text references job_orders(job_no)  on delete set null;      -- ใบงานแก้ไข = อ้างใบงานต้นเรื่อง

-- rollback:
-- alter table quotations drop column if exists variation_of;
-- alter table job_orders drop column if exists rework_of;
