-- 158: index ให้สายเอกสารขาย (รีวิวข้อ 13 — แดชบอร์ด/หน้าเอกสารช้าขึ้นเรื่อย ๆ ตามอายุร้าน)
--
-- ทั้งสายเอกสารมี index อยู่แค่ 2 ตัว (idx_invoices_quote, idx_receipts_invoice จาก mig 016)
-- Postgres ไม่สร้าง index ให้ foreign key อัตโนมัติ → quotation_items.quote_no / boq_items.boq_no
-- ไม่มี index เลย แปลว่าทุกครั้งที่เปิดพรีวิวเอกสาร 1 ใบ ฐานข้อมูลไล่อ่านตารางรายการทั้งตาราง
-- เพื่อหาไม่กี่บรรทัด (v458 ลดปริมาณข้อมูลที่ส่งข้ามเน็ตแล้ว แต่ฝั่งฐานข้อมูลยังสแกนเต็ม)
--
-- คอลัมน์วันที่ก็ยังไม่มี index — ตัวกรองช่วงวันที่ที่จะทำต่อจากนี้จะสแกนเต็มเหมือนกันถ้าไม่ทำตรงนี้ก่อน
-- ปลอดภัย: index ไม่แตะข้อมูล ไม่เปลี่ยนพฤติกรรมแอป ถอยกลับได้ด้วย drop index

create index if not exists idx_quotation_items_quote on quotation_items (quote_no);
create index if not exists idx_boq_items_boq         on boq_items (boq_no);
create index if not exists idx_po_items_po           on po_items (po_no);

-- คอลัมน์วันที่ที่หน้าเอกสาร/แดชบอร์ดใช้กรอง
create index if not exists idx_quotations_approved on quotations (approved_at);
create index if not exists idx_quotations_issue    on quotations (issue_date);
create index if not exists idx_invoices_issue      on invoices (issue_date);
create index if not exists idx_receipts_issue      on receipts (issue_date);
create index if not exists idx_boqs_issue          on boqs (issue_date);
create index if not exists idx_po_issue            on purchase_orders (issue_date);
-- listBoqs/listQuotations เรียงตาม created_at เสมอ → index ช่วยตอนเรียงด้วย
create index if not exists idx_boqs_created        on boqs (created_at);

-- คีย์ที่ใช้ไล่ความสัมพันธ์ระหว่างเอกสาร
create index if not exists idx_invoices_customer on invoices (customer_id);
create index if not exists idx_receipts_quote    on receipts (quote_no);
create index if not exists idx_job_orders_quote  on job_orders (quote_no);

-- ✅ ตรวจผล: ต้องได้ 13 แถว
-- select indexname from pg_indexes where schemaname = 'public'
--   and indexname in ('idx_quotation_items_quote','idx_boq_items_boq','idx_po_items_po',
--     'idx_quotations_approved','idx_quotations_issue','idx_invoices_issue','idx_receipts_issue',
--     'idx_boqs_issue','idx_po_issue','idx_boqs_created','idx_invoices_customer',
--     'idx_receipts_quote','idx_job_orders_quote');
