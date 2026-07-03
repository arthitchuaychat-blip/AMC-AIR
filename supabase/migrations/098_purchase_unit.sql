-- 098_purchase_unit.sql — หน่วยซื้อ ≠ หน่วยขาย/สต๊อก (เช่น ท่อทองแดง ขายเป็นเมตร ซื้อเป็นม้วน 1 ม้วน = 15 เมตร)
-- สต๊อก/เบิก/ขาย ยังเป็นหน่วยหลัก (เมตร) เหมือนเดิม · ใบสั่งซื้อกรอกเป็นหน่วยซื้อ (ม้วน + ราคา/ม้วน)
-- ตอนรับของเข้าสต๊อก ระบบแปลงเป็นหน่วยหลักให้ (จำนวน ×15 · ต้นทุน ÷15) · รันครั้งเดียว

alter table materials add column if not exists purchase_unit text;      -- หน่วยซื้อ เช่น 'ม้วน' (ว่าง = ซื้อหน่วยเดียวกับขาย)
alter table materials add column if not exists purchase_qty numeric;    -- 1 หน่วยซื้อ = กี่หน่วยหลัก เช่น 15

-- เก็บหน่วยของแต่ละบรรทัดในใบสั่งซื้อ (ใบเก่าไม่มีค่า = หน่วยหลักเดิม → แสดงผลถูกต้องย้อนหลัง)
alter table po_items add column if not exists unit text;

-- view material_stock ถูกสร้างก่อนมีคอลัมน์ใหม่ (m.* ล็อกรายชื่อคอลัมน์ตอนสร้าง view) → สร้างใหม่ให้เห็นคอลัมน์
-- นิยามยึดตามตัวล่าสุดจาก 086 (รวม adjust_in/adjust_out จากการนับสต๊อก)
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
