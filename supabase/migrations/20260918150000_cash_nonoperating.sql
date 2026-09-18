-- กระแสเงินสด: เปิดชนิดรายการ "ไม่ใช่รายรับ/รายจ่ายของธุรกิจ" (v851)
--   transfer   = โอนระหว่างบัญชีตัวเอง (บริษัท VAT กสิกร ↔ บุคคล กรุงศรี)
--   owner_draw = เจ้าของเบิกใช้ส่วนตัว
--   owner_in   = เจ้าของเติมเงินเข้า
-- แอปใช้แยกออกจากยอด "รับจริง/จ่ายจริง/แยกหมวดรายจ่าย" แต่ยังนับในยอดคงเหลือ
-- ยังไม่รัน = แอปยังใช้ได้ (fallback เก็บเป็น manual + คำนำหน้าโน้ต) · รันซ้ำได้ ไม่แตะข้อมูลเดิม
alter table cash_entries drop constraint if exists cash_entries_source_type_check;
alter table cash_entries add constraint cash_entries_source_type_check
  check (source_type in ('manual','invoice','receipt','payout','po','opening','expense','salary','labor_owed','expense_paid','expense_due','advance','loan','recur','transfer','owner_draw','owner_in'));
