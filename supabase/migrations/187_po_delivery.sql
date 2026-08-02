-- 187: ใบสั่งซื้อ (PO) — วันกำหนดรับ/ส่งสินค้า + วิธีรับสินค้า (ไปรับเอง / ผู้ขายมาส่งที่ออฟฟิศ)
alter table purchase_orders add column if not exists delivery_date   date;   -- วันนัดรับ/ส่งสินค้า (คาดว่าจะได้ของ)
alter table purchase_orders add column if not exists delivery_method text;   -- 'pickup' = ไปรับเอง · 'delivery' = ผู้ขายมาส่งที่ออฟฟิศ · null = ยังไม่ระบุ

-- rollback:
-- alter table purchase_orders drop column if exists delivery_date;
-- alter table purchase_orders drop column if exists delivery_method;
