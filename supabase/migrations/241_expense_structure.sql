-- 241: โครงสร้างการทำจ่าย — แยกต้นทุน/ค่าใช้จ่าย + รายการย่อย(สินทรัพย์) + วิธีจ่าย + บิลประจำ
-- (แอปทำงานได้โดยไม่ต้องรันทันที — submitExpense มี fallback ตัดคอลัมน์ที่ยังไม่มีออก)
alter table expense_requests add column if not exists kind       text;    -- 'cost'(ต้นทุนงาน) | 'opex'(ค่าใช้จ่ายดำเนินงาน)
alter table expense_requests add column if not exists pay_method text;    -- 'reimburse'(สำรองจ่าย) | 'petty'(เงินสดย่อย) | 'direct'(จ่ายผู้ขายตรง)
alter table expense_requests add column if not exists asset_tag  text;    -- รายการย่อย: รถ/สถานที่/เบอร์ (เช่น 'TOYOTA 3ฒษ3205')
alter table expense_requests add column if not exists recurring  boolean not null default false;  -- บิลประจำทุกเดือน
create index if not exists expense_requests_kind_idx on expense_requests(kind);
