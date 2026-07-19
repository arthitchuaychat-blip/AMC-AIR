-- 160: ตัดหนี้สูญ (รีวิว "กลาง" ข้อ 4)
--
-- ปัญหา: ใบแจ้งหนี้มีแค่ unpaid / paid / cancelled
-- ลูกค้าที่เบี้ยวเมื่อ 2 ปีก่อนยังนั่งอยู่ในถัง "เกินกำหนด 90 วันขึ้นไป" ของหน้าเงินค้างรับ
-- และยังถูกนับเป็นเส้น "คาดว่าจะรับ" ในกระแสเงินสดตลอดกาล
-- → การ์ด "เงินสุทธิพร้อมใช้" ในรายงานผู้บริหารบวกหนี้เน่าเข้าไปด้วย เจ้าของเห็นเงินพร้อมใช้สูงกว่าจริง
--
-- ทางออกเดียวที่มีตอนนี้คือกด "ยกเลิก" ใบแจ้งหนี้ ซึ่งผิดข้อเท็จจริงทางบัญชี:
-- งานทำไปแล้ว ของส่งไปแล้ว ใบกำกับภาษีออกไปแล้ว — แค่เก็บเงินไม่ได้
-- ยกเลิกจะทำให้ยอดขายก้อนนั้นหายจากรายงานขาย/ภาษีไปด้วย เหมือนไม่เคยขาย
--
-- แก้: เพิ่มสถานะ 'bad_debt' — ยอดขายและภาษีขายยังอยู่ในประวัติครบ แต่เลิกตามเป็นลูกหนี้

alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('unpaid', 'paid', 'cancelled', 'bad_debt'));

alter table invoices add column if not exists bad_debt_at     timestamptz;
alter table invoices add column if not exists bad_debt_reason text;

comment on column invoices.bad_debt_reason is 'เหตุผลที่ตัดหนี้สูญ — บังคับกรอก (เก็บคู่กับ audit_log)';

-- ✅ ตรวจผล: ต้องเห็น bad_debt อยู่ใน constraint
-- select pg_get_constraintdef(oid) from pg_constraint where conname = 'invoices_status_check';
