-- 096_po_vat.sql — ใบสั่งซื้อ: เลือกราคารวม VAT / ไม่รวม VAT · รันครั้งเดียว
-- ราคาต่อชิ้นเก็บเป็นราคาก่อน VAT (ต้นทุนสต๊อก) · ถ้า vat=true ยอดรวม/กระแสเงินสดคิด +7%

alter table purchase_orders add column if not exists vat boolean not null default false;
