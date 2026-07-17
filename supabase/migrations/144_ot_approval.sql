-- 144_ot_approval.sql
-- โหมด "OT ต้องรับรองก่อนคิดเงิน" (เปิด/ปิดใน HR → กะ & ตั้งค่า)
-- ot_ok: null/false = ยังไม่รับรอง (เมื่อเปิดโหมด OT วันนั้นจะไม่ถูกคิดเงิน/ไม่เข้ารายงาน)
--        true       = HR กด "รับรอง OT" ในแท็บวันนี้แล้ว
-- ปิดโหมดอยู่ (ค่าเริ่มต้น) ทุกอย่างเหมือนเดิม — OT คิดอัตโนมัติจากเวลาเช็คเอาท์
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table hr_attendance add column if not exists ot_ok boolean;
