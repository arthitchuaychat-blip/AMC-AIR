-- 131_web_services.sql — การ์ดบริการบนหน้าแรกเว็บ (หมวด "ครบทุกเรื่องแอร์ จบที่เดียว")
-- ทีมกราฟิกแก้ข้อความเองได้จากเมนู "จัดการเว็บไซต์" → แท็บ "การ์ดบริการ"
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists web_services (
  id         bigint generated always as identity primary key,
  image_url  text,                     -- รูปไอคอน (ไม่ใส่ = ใช้อีโมจิ)
  emoji      text,                     -- อีโมจิไอคอน เช่น ❄️ 💧 ↔️ 🔧
  title      text not null,            -- ชื่อบริการ
  subtitle   text,                     -- คำโปรยใต้ชื่อ
  bullets    text,                     -- จุดเด่น บรรทัดละ 1 ข้อ (เว็บใส่ ✓ ให้เอง)
  svc        text,                     -- หมวดค้นหาเมื่อกด: ติดตั้ง/ล้าง/ย้าย/ซ่อม/รื้อถอน/อื่นๆ (ว่าง = กดไม่ลิงก์)
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table web_services enable row level security;
grant select on web_services to anon;
grant select, insert, update, delete on web_services to authenticated;

drop policy if exists wsvc_read on web_services;
create policy wsvc_read on web_services for select to anon, authenticated
  using (active = true or my_role() in ('admin','sales','exec','graphic','finance'));

drop policy if exists wsvc_write on web_services;
create policy wsvc_write on web_services for all to authenticated
  using (my_role() in ('admin','sales','exec','graphic')) with check (my_role() in ('admin','sales','exec','graphic'));

-- ชุดเริ่มต้น = การ์ด 4 ใบที่โชว์อยู่บนเว็บตอนนี้ (แก้/เพิ่ม/ลบได้จากหลังบ้าน)
insert into web_services (emoji, title, subtitle, bullets, svc, sort)
select * from (values
  ('❄️', 'ติดตั้งแอร์', 'บ้าน/สำนักงาน เดินท่อเรียบร้อย ทดสอบก่อนส่งมอบ', E'สำรวจหน้างานฟรี\nแถมชุดวัสดุติดตั้งมาตรฐาน\nรับประกันงานติดตั้ง', 'ติดตั้ง', 1),
  ('💧', 'ล้างแอร์ / บำรุงรักษา', 'ล้างใหญ่ เป่าโฟม ถึงแผงคอยล์ เย็นเต็มระบบ', E'ตรวจเช็กน้ำยา/ระบบ\nแนะนำรอบล้างทุก 6 เดือน\nมีบริการสัญญารายปี', 'ล้าง', 2),
  ('↔️', 'ย้ายแอร์', 'ถอด–ติดตั้งจุดใหม่ ครบวงจร', E'เก็บน้ำยาก่อนถอด\nติดตั้งใหม่พร้อมทดสอบ\nรับประกันงานติดตั้ง', 'ย้าย', 3),
  ('🔧', 'ซ่อม / แก้ไข', 'แอร์ไม่เย็น น้ำหยด เสียงดัง วินิจฉัยทุกอาการ', E'ประเมินอาการก่อนซ่อม\nอะไหล่แท้\nรับประกันงานซ่อม', 'ซ่อม', 4)
) as seed(emoji, title, subtitle, bullets, svc, sort)
where not exists (select 1 from web_services);

-- ✅ ตรวจผล: ต้องเห็นการ์ด 4 ใบ
select id, emoji, title, svc, sort, active from web_services order by sort;
