-- 114_txn_stock_insert.sql — ให้ ธุรการวัสดุ (stock) บันทึกความเคลื่อนไหวสินค้าได้ (ซื้อเข้า/เบิก/คืน/ตัดเสีย/ปรับยอด)
-- อาการ: ซื้อเข้า/เบิก แล้วขึ้น "new row violates row-level security policy for table transactions"
-- สาเหตุ: live DB ยังใช้ policy ชุดเก่า (mig 012) ที่ไม่รวม stock — migration 013 ไม่ถูกรัน
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

drop policy if exists txn_insert on transactions;
create policy txn_insert on transactions for insert to authenticated
  with check (
    my_role() in ('admin', 'exec', 'finance', 'stock')
    or (my_role() = 'tech' and team = my_team() and type in ('withdraw', 'return'))
    or (my_role() = 'lead_tech' and type in ('withdraw', 'return'))
  );

-- ✅ ตรวจผล: เงื่อนไข insert ต้องมี stock
select polname, pg_get_expr(polwithcheck, polrelid) as เงื่อนไขเพิ่ม
from pg_policy where polrelid = 'transactions'::regclass and polname = 'txn_insert';
