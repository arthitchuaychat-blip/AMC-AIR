-- 232: ภาษีซื้อบนใบเบิกจ่าย (บิลหน้างานที่ไม่ผ่าน PO)
-- ให้บันทึกภาษีซื้อ (input VAT) จากบิลค่าน้ำมัน/อะไหล่ร้านค้า/ของหน้างาน ที่มีใบกำกับภาษี
-- เพื่อให้รายงานภาษี (ภ.พ.30) นับภาษีซื้อครบ + ลงบัญชีแยกภาษีซื้อ 1300 อัตโนมัติ
alter table expense_requests add column if not exists vat_amt numeric not null default 0;
comment on column expense_requests.vat_amt is 'ภาษีซื้อ (input VAT) ของบิลนี้ ถ้ามีใบกำกับภาษี — ปกติ = amount*7/107 (ราคารวม VAT)';
