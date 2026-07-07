-- 108_po_stock_write.sql — ให้ ธุรการวัสดุ (stock) บันทึกใบสั่งซื้อได้ (แก้ RLS ที่ฐานข้อมูลจริงยังเป็นชุดเก่า)
-- อาการ: กดบันทึกใบสั่งซื้อแล้วขึ้น new row violates row-level security policy for table "purchase_orders"
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- 1) นโยบายเขียนใบสั่งซื้อ + รายการสินค้าในใบ — ชุดที่ถูกต้อง: admin / exec / finance / stock
drop policy if exists po_write on purchase_orders;
create policy po_write on purchase_orders for all to authenticated
  using (my_role() in ('admin', 'exec', 'finance', 'stock'))
  with check (my_role() in ('admin', 'exec', 'finance', 'stock'));

drop policy if exists poi_write on po_items;
create policy poi_write on po_items for all to authenticated
  using (my_role() in ('admin', 'exec', 'finance', 'stock'))
  with check (my_role() in ('admin', 'exec', 'finance', 'stock'));

-- ✅ ตรวจผล 1: นโยบายที่ใช้จริงตอนนี้ (ต้องเห็น stock ในเงื่อนไข)
select polname as นโยบาย, pg_get_expr(polwithcheck, polrelid) as เงื่อนไขเขียน
from pg_policy where polrelid = 'purchase_orders'::regclass;

-- ✅ ตรวจผล 2: role ของพนักงานธุรการวัสดุ — ต้องเป็น 'stock' (ถ้าไม่ใช่ ไปแก้ใน ตั้งค่า → จัดการผู้ใช้)
select name as ชื่อ, role from profiles order by role, name;
