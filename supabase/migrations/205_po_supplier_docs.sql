-- 205_po_supplier_docs.sql — แนบเอกสารผู้ขาย + เลขที่ใบส่งของ/ใบแจ้งหนี้ บนใบสั่งซื้อ (PO)
--
-- เจ้าของ: อยากแนบไฟล์ ใบส่งสินค้า/ใบแจ้งหนี้ + กรอกเลขที่เอกสาร เพื่อค้นหา/จับคู่ (match) เอกสารได้ง่าย
--   dn_no       = เลขที่ใบส่งของ (Delivery Note) จากผู้ขาย
--   sup_inv_no  = เลขที่ใบแจ้งหนี้/ใบกำกับภาษี ของผู้ขาย
--   attachments = ไฟล์แนบ [{name,url}] (ใบส่งของ/ใบแจ้งหนี้ที่สแกน/ถ่ายรูป)
--
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table purchase_orders add column if not exists dn_no       text;
alter table purchase_orders add column if not exists sup_inv_no  text;
alter table purchase_orders add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ค้นหาเลขเอกสารผู้ขายให้เร็ว (จับคู่ตอนตั้งเบิก/จ่าย)
create index if not exists po_dn_no_idx      on purchase_orders(dn_no)      where dn_no is not null;
create index if not exists po_sup_inv_no_idx on purchase_orders(sup_inv_no) where sup_inv_no is not null;

-- ✅ ตรวจผล
select 'po supplier docs ready' as status;
