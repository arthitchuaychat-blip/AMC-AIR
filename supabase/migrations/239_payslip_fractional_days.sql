-- 239: วันมา/ขาด/ลา ในสลิปเงินเดือนรองรับ "ครึ่งวัน" (0.5)
-- เดิมเป็น int → ลาครึ่งวันเช้า/บ่ายทำให้ค่าเป็นเศษ (เช่น 6.5) แล้วบันทึกรอบไม่ได้:
--   invalid input syntax for type integer: "6.5"
alter table payslips alter column present_days    type numeric using present_days::numeric;
alter table payslips alter column absent_days     type numeric using absent_days::numeric;
alter table payslips alter column leave_days      type numeric using leave_days::numeric;
alter table payslips alter column over_leave_days type numeric using over_leave_days::numeric;
