-- 100_po_procurement.sql — กระบวนการสั่งซื้อตามออเดอร์ · รันครั้งเดียว
-- (1) PO เชื่อมใบเสนอราคาที่อนุมัติ (quote_no) — สั่งแอร์ต้องเชื่อม · วัสดุเชื่อมหรือไม่ก็ได้
-- (2) การจ่ายเงินแยกจากการรับของ: ส่งขออนุมัติในเมนูเบิกจ่าย (expense_id) · จ่ายแล้วประทับ paid_at
--     กระแสเงินสด: สร้าง PO → คาดว่าจะจ่าย · จ่ายเงินแล้ว → จ่ายจริง (ไม่ผูกกับการรับของอีกต่อไป)

alter table purchase_orders add column if not exists quote_no  text;         -- ใบเสนอราคาที่อ้างอิง
alter table purchase_orders add column if not exists expense_id uuid;        -- คำขอเบิกจ่ายที่ผูก (รออนุมัติ/จ่าย)
alter table purchase_orders add column if not exists paid_at   timestamptz;  -- วันที่จ่ายเงินจริง
