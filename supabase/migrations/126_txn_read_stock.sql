-- 126_txn_read_stock.sql — ให้ ธุรการวัสดุ (stock) "อ่าน" ความเคลื่อนไหวสินค้าได้ (คู่กับ 114 ที่แก้ฝั่งเขียน)
-- อาการ: นับสต๊อกแล้ว "ยอดในระบบ" ขึ้น 0 ทุกตัว → กดปรับยอดแล้วยอดนับถูกบวกทับของเดิม (PLUG7: 400+1800=2200)
-- สาเหตุ: live DB ใช้ policy อ่าน transactions ชุดเก่าที่ไม่รวม stock → view material_stock (security_invoker)
--         คำนวณยอดคงเหลือจากรายการที่ "ผู้เรียกมองเห็น" = ธุรการวัสดุเห็น 0 รายการ → ยอดระบบ 0 ทั้งคลัง
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

drop policy if exists txn_read on transactions;
create policy txn_read on transactions for select to authenticated
  using (my_role() in ('admin','exec','finance','stock','lead_tech') or team = my_team());

drop policy if exists txn_admin_edit on transactions;
create policy txn_admin_edit on transactions for update to authenticated
  using (my_role() in ('admin','exec','finance','stock'));

-- ✅ ตรวจผล: เงื่อนไขอ่านต้องมี stock
select polname, pg_get_expr(polqual, polrelid) as เงื่อนไข
from pg_policy where polrelid = 'transactions'::regclass and polname in ('txn_read','txn_admin_edit');
