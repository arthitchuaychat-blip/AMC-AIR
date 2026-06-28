-- 079_web_content.sql — เนื้อหาเว็บที่ทีมกราฟิกจัดการเองจากหลังบ้าน (เมนู "จัดการเว็บไซต์")
-- อัลบั้มผลงาน / บทความ / ข่าวในสื่อ — รูปแบบเดียวกับ web_clients + web_banners
-- (ปกสไลด์ = web_banners มิเกรชัน 078, โลโก้ลูกค้า = web_clients มิเกรชัน 072)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- 1) อัลบั้มผลงาน
create table if not exists web_portfolio (
  id         bigint generated always as identity primary key,
  image_url  text not null,
  title      text,                    -- คำบรรยายผลงาน
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2) บทความ
create table if not exists web_articles (
  id         bigint generated always as identity primary key,
  image_url  text,
  title      text not null,           -- หัวข้อบทความ
  excerpt    text,                    -- คำโปรย
  link_url   text,                    -- ลิงก์อ่านต่อ (ถ้ามี)
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3) ข่าวในสื่อ
create table if not exists web_press (
  id         bigint generated always as identity primary key,
  image_url  text,
  source     text,                    -- ชื่อสื่อ (เช่น ไทยรัฐ)
  title      text not null,           -- หัวข้อข่าว
  link_url   text,                    -- ลิงก์ข่าว
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['web_portfolio','web_articles','web_press'] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select on %I to anon', t);
    execute format('drop policy if exists wcnt_read on %I', t);
    execute format($p$create policy wcnt_read on %I for select to anon, authenticated
      using (active = true or my_role() in ('admin','sales','exec','finance'))$p$, t);
    execute format('drop policy if exists wcnt_write on %I', t);
    execute format($p$create policy wcnt_write on %I for all to authenticated
      using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'))$p$, t);
  end loop;
end $$;
