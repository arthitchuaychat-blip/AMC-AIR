-- 193_fb_comments.sql — คอมเมนต์ใต้โพสต์ Facebook เข้าเมนูแชตลูกค้า (รับ/ตอบ/ซ่อน/ปิด)
-- ต้องคู่กับสิทธิ์ Meta: pages_read_engagement (อ่านคอมเมนต์) + pages_manage_engagement (ตอบ/ซ่อน)
-- และสมัคร webhook field 'feed' (fb-subscribe.js) · webhook เขียนผ่าน service role (ข้าม RLS)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists fb_comments (
  id           bigint generated always as identity primary key,
  comment_id   text unique not null,             -- id คอมเมนต์จาก FB
  post_id      text,                              -- โพสต์ที่ถูกคอมเมนต์
  parent_id    text,                              -- คอมเมนต์แม่ (ถ้าเป็นการตอบใต้คอมเมนต์)
  from_id      text,                              -- id ผู้คอมเมนต์
  from_name    text,
  message      text,
  permalink    text,
  is_hidden    boolean not null default false,
  replied      boolean not null default false,    -- เพจตอบคอมเมนต์นี้แล้ว
  status       text not null default 'open' check (status in ('open','done','hidden')),
  assigned_to  uuid,
  commented_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists fb_comments_status_idx on fb_comments(status);
create index if not exists fb_comments_post_idx on fb_comments(post_id);

alter table fb_comments enable row level security;
-- อ่าน = ผู้ล็อกอินทุกคน (เหมือน fb_contacts mig 156) · จัดการ = ออฟฟิศ (เหมือน fb_contacts_write mig 095)
drop policy if exists fb_comments_read on fb_comments;
create policy fb_comments_read on fb_comments for select to authenticated using (true);
drop policy if exists fb_comments_write on fb_comments;
create policy fb_comments_write on fb_comments for all to authenticated
  using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));

-- ✅ ตรวจผล
select 'fb_comments ready' as status;
