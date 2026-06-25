-- 068_sales_add_materials.sql
-- ให้ "ฝ่ายขาย" (sales) เพิ่ม/แก้ไขสินค้าในคลังได้ (เดิมได้เฉพาะ admin/exec/finance/stock)
-- คู่กับการเปิดสิทธิ์เมนูคลังสินค้าของ sales เป็น "แก้ไข" ใน lib/permissions.js
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

drop policy if exists mat_write on materials;
create policy mat_write on materials for all to authenticated
  using (my_role() in ('admin','exec','finance','stock','sales'))
  with check (my_role() in ('admin','exec','finance','stock','sales'));
