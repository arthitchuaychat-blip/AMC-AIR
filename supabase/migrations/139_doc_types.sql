-- 139_doc_types.sql — ประเภทงาน (CRM) + ประเภทสินค้าใบสั่งซื้อ
-- 1) BOQ / ใบเสนอราคา: job_type ('survey'|'install'|'repair'|'maintenance'|'other')
--    บังคับเลือกตอนสร้าง BOQ แล้วติดไปทั้งสายเอกสาร (ใบเสนอ → ใบงาน ซึ่งมี job_type อยู่แล้ว)
-- 2) ใบสั่งซื้อ: po_type ('ac' = เครื่องปรับอากาศ | 'material' = วัสดุและอะไหล่) — บังคับเลือกตอนสร้าง
alter table boqs            add column if not exists job_type text;
alter table quotations      add column if not exists job_type text;
alter table purchase_orders add column if not exists po_type text;

-- backfill ประเภทงานย้อนหลังจากใบงานที่ผูกกัน (เท่าที่มีข้อมูล)
update quotations q set job_type = j.job_type
  from job_orders j where j.quote_no = q.quote_no and q.job_type is null and j.job_type is not null;
update boqs b set job_type = q.job_type
  from quotations q where q.boq_no = b.boq_no and b.job_type is null and q.job_type is not null;

-- backfill ใบสั่งซื้อเก่า: มีรายการที่เป็นแอร์ → 'ac' · ไม่งั้น 'material'
update purchase_orders po set po_type =
  case when exists (
    select 1 from po_items i join materials m on m.code = i.material_code
    where i.po_no = po.po_no and m.kind = 'ac'
  ) then 'ac' else 'material' end
where po.po_type is null;

-- ✅ ตรวจผล: ต้องเห็น 3 แถว (boqs.job_type, quotations.job_type, purchase_orders.po_type)
select table_name, column_name from information_schema.columns
where (column_name = 'job_type' and table_name in ('boqs','quotations'))
   or (column_name = 'po_type'  and table_name = 'purchase_orders')
order by table_name;
