-- 248: เติมคอลัมน์ให้ฐานข้อมูลจริง "ครบตาม repo" (รันซ้ำได้ปลอดภัย — เติมเฉพาะที่ขาด)
-- เหตุ: พบว่า ALTER บางตัวจาก mig 242/243/246 อาจยังไม่ถูกรันบนฐานข้อมูลจริง
--   → ทำให้ loans.submitted_seq หาย (ค่างวดนับผิด) และ expense_requests.supplier หาย (ชื่อผู้ขายไม่บันทึก)
-- รันไฟล์นี้ครั้งเดียวแก้ได้ทั้งสองอย่าง · ไม่ลบ/ไม่แก้ข้อมูลเดิม แค่เพิ่มคอลัมน์ที่ยังไม่มี

-- ── หนี้สิน/ค่างวด (mig 242) ──
alter table loans add column if not exists submitted_seq int not null default 0;      -- งวดที่ตั้งจ่ายแล้ว (กันตั้งซ้ำ/นับซ้ำ)
alter table loans add column if not exists auto_debit boolean not null default false;  -- หักบัญชีอัตโนมัติ
alter table loans add column if not exists attachments jsonb not null default '[]'::jsonb;  -- ไฟล์สัญญา
alter table loans add column if not exists steps jsonb not null default '[]'::jsonb;    -- ค่างวดขั้นบันได
alter table loans add column if not exists balloon numeric;                             -- งวดบอลลูน
alter table loans add column if not exists entity text not null default 'company';      -- บริษัท/บุคคล

-- ── เบิกจ่าย (mig 243 supplier / 246 wht / 112 expected_pay_date) ──
alter table expense_requests add column if not exists supplier text;                    -- ชื่อผู้ขาย/ร้านค้า
alter table expense_requests add column if not exists wht_pct numeric not null default 0;  -- % หัก ณ ที่จ่าย
alter table expense_requests add column if not exists wht_amt numeric not null default 0;  -- ยอดหัก ณ ที่จ่าย
alter table expense_requests add column if not exists expected_pay_date date;           -- วันครบกำหนดจ่าย
