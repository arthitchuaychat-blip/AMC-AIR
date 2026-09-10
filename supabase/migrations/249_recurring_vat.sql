-- 249: รายจ่ายประจำ — ธงว่าบิลนี้มี VAT (เน็ต/มือถือ ฯลฯ) เพื่อถอดภาษีซื้อเคลมได้
-- (แอปทำงานได้โดยไม่ต้องรันทันที — saveRecurringBill มี fallback ตัดคอลัมน์ที่ยังไม่มี)
alter table recurring_bills add column if not exists has_vat boolean not null default false;
