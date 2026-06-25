-- 072_web_clients.sql — โลโก้ "ลูกค้าของเรา" บนเว็บไซต์ จัดการแยกทีละราย (เพิ่ม/ลบจากหลังบ้าน)
-- รันใน Supabase → SQL Editor (ครั้งเดียว). ข้อมูลไม่ลับ (ชื่อ+โลโก้) → เว็บ public อ่านได้

create table if not exists web_clients (
  id         bigint generated always as identity primary key,
  name       text not null,           -- ชื่อลูกค้า/องค์กร
  logo_url   text,                    -- URL โลโก้ (อัปโหลดผ่านหลังบ้าน)
  sort       int not null default 0,  -- ลำดับการแสดง
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table web_clients enable row level security;
grant select on web_clients to anon;

-- เว็บ public เห็นเฉพาะที่ active · ฝ่ายออฟฟิศเห็นทั้งหมด
drop policy if exists wc_read on web_clients;
create policy wc_read on web_clients for select to anon, authenticated
  using (active = true or my_role() in ('admin','sales','exec','finance'));

-- เพิ่ม/แก้/ลบ: ธุรการ/ผู้บริหาร/ฝ่ายขาย
drop policy if exists wc_write on web_clients;
create policy wc_write on web_clients for all to authenticated
  using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));
