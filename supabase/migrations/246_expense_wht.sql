-- 246: ภาษีหัก ณ ที่จ่าย (WHT) บนใบเบิกจ่าย — จ่ายผู้ขาย/ค่าบริการที่ต้องหัก ณ ที่จ่าย
-- amount = ยอดเต็ม (ก่อนหัก) · wht_amt = ยอดหัก · เงินจ่ายจริงให้ผู้ขาย = amount − wht_amt
-- (แอปทำงานได้โดยไม่ต้องรันทันที — submit/update มี fallback ตัดคอลัมน์ที่ยังไม่มี)
alter table expense_requests add column if not exists wht_pct numeric not null default 0;   -- % หัก ณ ที่จ่าย (1/2/3/5 ...)
alter table expense_requests add column if not exists wht_amt numeric not null default 0;   -- ยอดหัก ณ ที่จ่าย (บาท)
