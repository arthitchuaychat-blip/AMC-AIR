-- 080_web_ads.sql — ภาพโฆษณาแถบข้าง (sidebar) บนเว็บไซต์ จัดการจากหลังบ้าน
-- เหมือน web_banners/web_clients · ทีมกราฟิกอัปโหลด/สลับ/ลบเองได้
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists web_ads (
  id         bigint generated always as identity primary key,
  image_url  text not null,
  title      text,                    -- ชื่อ/คำบรรยาย (ไม่บังคับ)
  link_url   text,                    -- กดแล้วไปไหน (ไม่บังคับ)
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table web_ads enable row level security;
grant select on web_ads to anon;

drop policy if exists wad_read on web_ads;
create policy wad_read on web_ads for select to anon, authenticated
  using (active = true or my_role() in ('admin','sales','exec','finance'));

drop policy if exists wad_write on web_ads;
create policy wad_write on web_ads for all to authenticated
  using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));
