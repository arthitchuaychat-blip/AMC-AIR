-- ใบเสร็จ: หัก ณ ที่จ่าย (ติ๊กเลือก + อัตราแก้ไขได้)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
alter table receipts add column if not exists wht boolean not null default false;
alter table receipts add column if not exists wht_rate numeric not null default 3;
