-- 078_web_banners.sql — ภาพปก/แบนเนอร์ Hero บนเว็บไซต์ (สไลด์โชว์) จัดการจากหลังบ้าน
-- เหมือน web_clients: ทีมกราฟิกอัปโหลด/สลับ/ลบภาพได้เอง · เว็บ public อ่านได้ (ไม่ลับ)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists web_banners (
  id         bigint generated always as identity primary key,
  image_url  text not null,           -- URL ภาพปก (อัปโหลดผ่านหลังบ้าน)
  caption    text,                    -- ข้อความบนภาพ (ไม่ใส่ก็ได้)
  link_url   text,                    -- กดแล้วไปหน้าไหน (ไม่ใส่ก็ได้)
  sort       int not null default 0,  -- ลำดับการเล่นสไลด์
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table web_banners enable row level security;
grant select on web_banners to anon;

-- เว็บ public เห็นเฉพาะที่ active · ฝ่ายออฟฟิศเห็นทั้งหมด
drop policy if exists wb_read on web_banners;
create policy wb_read on web_banners for select to anon, authenticated
  using (active = true or my_role() in ('admin','sales','exec','finance'));

-- เพิ่ม/แก้/ลบ: ธุรการ/ผู้บริหาร/ฝ่ายขาย (ทีมกราฟิกใช้บัญชีเหล่านี้)
drop policy if exists wb_write on web_banners;
create policy wb_write on web_banners for all to authenticated
  using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));
