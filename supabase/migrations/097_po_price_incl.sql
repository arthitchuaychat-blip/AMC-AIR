-- 097_po_price_incl.sql — ใบสั่งซื้อ: จำว่า "ราคาที่กรอกต่อชิ้นรวม VAT แล้วหรือยัง" · รันครั้งเดียว
-- price_incl=true → ตอนกรอกใส่ราคารวม VAT (ระบบถอด VAT เก็บเป็นราคาก่อนภาษีใน po_items.price)
-- price_incl=false → กรอกราคาก่อน VAT ตรง ๆ (po_items.price เก็บราคาก่อนภาษีเช่นกัน)
-- ยอด/กระแสเงินสดอิงราคาก่อนภาษี + flag vat เหมือนเดิม (096) — price_incl มีผลแค่หน้าจอกรอก

alter table purchase_orders add column if not exists price_incl boolean not null default false;
