-- 119_doc_issue_date.sql — เพิ่ม "วันที่เอกสาร" (แก้ไขได้) ให้เอกสารที่ยังไม่มี: BOQ / ใบสั่งซื้อ / ใบงาน / ใบเตรียมวัสดุ
-- (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ/ใบวางบิล/ใบส่งมอบงาน มี issue_date/doc_date อยู่แล้ว)
-- เลขที่เอกสารยังรันอัตโนมัติเหมือนเดิม — วันที่เป็นแค่ข้อมูลบนเอกสาร
-- รันใน Supabase → SQL Editor (ครั้งเดียว · รันซ้ำได้)

alter table boqs            add column if not exists issue_date date;
alter table purchase_orders add column if not exists issue_date date;
alter table job_orders      add column if not exists issue_date date;
alter table material_preps  add column if not exists issue_date date;

-- เติมย้อนหลังจากวันที่สร้าง (เวลาไทย) ให้ใบเก่ามีวันที่ครบ
update boqs            set issue_date = (created_at at time zone 'Asia/Bangkok')::date where issue_date is null;
update purchase_orders set issue_date = (created_at at time zone 'Asia/Bangkok')::date where issue_date is null;
update job_orders      set issue_date = (created_at at time zone 'Asia/Bangkok')::date where issue_date is null;
update material_preps  set issue_date = (created_at at time zone 'Asia/Bangkok')::date where issue_date is null;

-- ✅ ตรวจผล: ทุกตารางต้องมีคอลัมน์ issue_date
select table_name, column_name from information_schema.columns
where column_name = 'issue_date' and table_name in ('boqs','purchase_orders','job_orders','material_preps')
order by table_name;
