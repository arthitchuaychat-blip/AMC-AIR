-- 121_ac_power_cost.sql — คำนวณ "ประมาณค่าไฟ/ปี" ให้แอร์ทุกรายการจากค่า SEER
-- สมมติฐานร้าน: เปิดใช้งาน 8 ชม./วัน ทั้งปี (2,920 ชม.) · ค่าไฟ 5 บาท/หน่วย
-- สูตร: กำลังไฟ (kW) = BTU ÷ SEER ÷ 1000 → ค่าไฟ/ปี = kW × 8 × 365 × 5 (ปัดเป็นบาทเต็ม)
-- เขียนทับทุกรายการแอร์ที่มี BTU + SEER เพื่อให้ตัวเลขเป็นมาตรฐานเดียวกันทั้งคลัง
-- รันใน Supabase → SQL Editor (ครั้งเดียว · รันซ้ำได้)

update materials
set power_cost_year = round((btu::numeric / seer / 1000) * 8 * 365 * 5)
where kind = 'ac'
  and coalesce(seer, 0) > 0
  and coalesce(btu, 0) > 0;

-- ✅ ตรวจผล: ดูตัวอย่าง 20 รายการ (36,000 BTU · SEER 12.93 ≈ 40,650 บาท/ปี)
select code, name_th, btu, seer, power_cost_year
from materials where kind = 'ac' and power_cost_year is not null
order by btu desc limit 20;

-- รายการแอร์ที่ยังไม่มี SEER (คำนวณไม่ได้ — ไปเติม SEER ในแอปก่อน)
select count(*) as แอร์ที่ยังไม่มี_seer from materials
where kind = 'ac' and coalesce(active, true) = true and coalesce(seer, 0) = 0;
