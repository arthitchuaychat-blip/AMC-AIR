-- 115_prep_link.sql — ผูกใบสั่งซื้อ + รายการเบิก กลับไปที่ "ใบเตรียมวัสดุ" ที่แตกออกมา
-- ไว้ให้ลบใบเตรียมวัสดุแล้วลบ PO/เบิกที่ผูกกันได้ (mig 109 = ใบเตรียมวัสดุ)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table purchase_orders add column if not exists prep_no text;
alter table transactions    add column if not exists prep_no text;

create index if not exists purchase_orders_prep_idx on purchase_orders(prep_no);
create index if not exists transactions_prep_idx on transactions(prep_no);
