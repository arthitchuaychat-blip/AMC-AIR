-- 085_cashflow_sales_hr.sql — ให้ฝ่ายขาย (sales) + ฝ่ายบุคคล (hr) ดู/แก้ไข กระแสเงินสดได้
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- (1) cash_entries: อ่าน/เขียน (เพิ่ม/แก้/ลบรายการ + ให้ auto-sync เขียนได้)
drop policy if exists cash_entries_rw on cash_entries;
create policy cash_entries_rw on cash_entries for all
  using (my_role() in ('admin','exec','finance','sales','hr'))
  with check (my_role() in ('admin','exec','finance','sales','hr'));

-- (2) sub_payouts: อ่านอย่างเดียวสำหรับ sales/hr — สำคัญ!
-- auto-sync ของกระแสเงินสดจะ reconcile จากเอกสารทั้งหมด ถ้า sales/hr มองไม่เห็น sub_payouts
-- (RLS กรองออกหมด) ระบบจะนึกว่า "ไม่มีรายการจ่ายช่างซัพ" แล้วเผลอลบรายการนั้นออกจากกระแสเงินสด
-- การเขียน (สร้าง/แก้/ลบใบจ่ายช่างซัพ) ยังจำกัดที่ admin/exec/finance ผ่าน policy sub_payouts_rw เดิม
drop policy if exists sub_payouts_read on sub_payouts;
create policy sub_payouts_read on sub_payouts for select to authenticated
  using (my_role() in ('admin','exec','finance','sales','hr'));
