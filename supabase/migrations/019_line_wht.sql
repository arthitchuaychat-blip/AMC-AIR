-- หัก ณ ที่จ่าย แบบเลือกรายบรรทัด: เก็บ snapshot รายการสินค้า/บริการ + ธงหัก ณ ที่จ่ายต่อบรรทัด
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table invoices add column if not exists items jsonb default '[]';
alter table invoices add column if not exists wht_rate numeric not null default 3;
alter table receipts add column if not exists items jsonb default '[]';
