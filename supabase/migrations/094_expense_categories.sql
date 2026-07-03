-- 094_expense_categories.sql — หมวดค่าใช้จ่าย (เลือก + สร้างเพิ่มได้) เพื่อวิเคราะห์ค่าใช้จ่าย · รันครั้งเดียว
-- ใช้กับ: ขอเบิก (expense_requests.category) + เพิ่มรายการเดินบัญชี (account_entries.category)

create table if not exists expense_categories (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
insert into expense_categories (name, sort) values
  ('เดินทาง/น้ำมัน', 1), ('วัสดุ/อุปกรณ์', 2), ('ค่าแรง/รับเหมา', 3),
  ('ค่าธรรมเนียมธนาคาร', 4), ('รับรอง/เลี้ยงลูกค้า', 5), ('ค่าเช่า', 6),
  ('เงินเดือน/สวัสดิการ', 7), ('การตลาด/โฆษณา', 8),
  ('สาธารณูปโภค (น้ำ/ไฟ/เน็ต)', 9), ('อื่นๆ', 99)
on conflict (name) do nothing;

-- ป้ายหมวดบนรายการเดินบัญชี (สำหรับรายการที่บันทึกเอง / เบิกจ่าย)
alter table account_entries add column if not exists category text;

alter table expense_categories enable row level security;
-- อ่านได้ทุกคน · เพิ่มหมวดใหม่ได้ทุกคนที่ล็อกอิน (ไม่มี update/delete policy → ลบ/แก้ไม่ได้ กันหมวดหาย)
drop policy if exists ec_read on expense_categories;
create policy ec_read on expense_categories for select to authenticated using (true);
drop policy if exists ec_insert on expense_categories;
create policy ec_insert on expense_categories for insert to authenticated with check (true);
