-- เพิ่มช่อง "รายละเอียดสินค้า" รายบรรทัด ในเอกสาร BOQ + ใบเสนอราคา (แก้เฉพาะในเอกสารนั้นได้ + แสดงตอนพิมพ์)
-- (ใบแจ้งหนี้/ใบเสร็จ เก็บรายการเป็น jsonb อยู่แล้ว — เพิ่ม field desc ในตัว object ไม่ต้อง migrate)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table boq_items       add column if not exists description text;
alter table quotation_items add column if not exists description text;
