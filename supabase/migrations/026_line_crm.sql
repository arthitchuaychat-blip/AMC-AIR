-- CRM บนแชต LINE: สถานะลูกค้า (เฟส) + ผู้รับผิดชอบ
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table line_contacts add column if not exists stage       text default 'new';
alter table line_contacts add column if not exists assigned_to uuid references auth.users(id) on delete set null;

-- (RLS lc_update เดิมอนุญาตให้ฝ่ายออฟฟิศแก้ line_contacts อยู่แล้ว — รวมถึงสองคอลัมน์นี้)
