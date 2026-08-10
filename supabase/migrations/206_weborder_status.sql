-- 206_weborder_status.sql — เพิ่มสถานะคำสั่งซื้อจากเว็บ: "ติดต่อไม่ได้" + "รอติดต่อใหม่อีกครั้ง"
--
-- web_orders.status มี CHECK constraint จำกัดค่าไว้ (mig 071) → ต้องขยาย ไม่งั้นตั้งสถานะใหม่จะถูก DB ปฏิเสธ
--   unreachable = ติดต่อไม่ได้ · recontact = รอติดต่อใหม่อีกครั้ง
--
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table web_orders drop constraint if exists web_orders_status_check;
alter table web_orders add constraint web_orders_status_check
  check (status in ('new','contacted','unreachable','recontact','quoted','done','cancelled'));

-- ✅ ตรวจผล
select 'web_order status expanded' as status;
