-- 134_web_reviews.sql — รีวิวลูกค้า (หมวด "ลูกค้าพูดถึงเรา") บนหน้าเว็บ แก้ได้จากหลังบ้าน
-- เมนู "จัดการเว็บไซต์" → แท็บ "⭐ รีวิวลูกค้า" · รูปแบบเดียวกับ web_services (mig 131)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists web_reviews (
  id         bigint generated always as identity primary key,
  image_url  text,                     -- รูปลูกค้า (ไม่ใส่ = ใช้อักษรย่อจากชื่อ)
  name       text not null,            -- ชื่อลูกค้า เช่น คุณกนกวรรณ
  role       text,                     -- คำอธิบายใต้ชื่อ เช่น ลูกค้าบ้านพักอาศัย
  text       text not null,            -- ข้อความรีวิว
  stars      int default 5,             -- จำนวนดาว 1–5 (ว่าง = เว็บถือเป็น 5)
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table web_reviews enable row level security;
grant select on web_reviews to anon;
grant select, insert, update, delete on web_reviews to authenticated;

drop policy if exists wrev_read on web_reviews;
create policy wrev_read on web_reviews for select to anon, authenticated
  using (active = true or my_role() in ('admin','sales','exec','graphic','finance'));

drop policy if exists wrev_write on web_reviews;
create policy wrev_write on web_reviews for all to authenticated
  using (my_role() in ('admin','sales','exec','graphic')) with check (my_role() in ('admin','sales','exec','graphic'));

-- ชุดเริ่มต้น = รีวิว 3 ใบที่โชว์อยู่บนเว็บตอนนี้
insert into web_reviews (name, role, text, stars, sort)
select * from (values
  ('คุณกนกวรรณ', 'ลูกค้าบ้านพักอาศัย', 'ติดตั้งเร็ว เก็บงานเรียบร้อย ช่างสุภาพมาก แอร์เย็นฉ่ำเลยค่ะ', 5, 1),
  ('คุณสมชาย', 'เจ้าของร้านอาหาร', 'ใช้บริการล้างแอร์ประจำทุก 6 เดือน ตรงเวลา ราคายุติธรรม แนะนำเลย', 5, 2),
  ('คุณณัฐพล', 'ผู้จัดการอาคาร', 'ดูแลแอร์ทั้งออฟฟิศ 20 กว่าเครื่อง มีระบบติดตามงานชัดเจน ประทับใจ', 5, 3)
) as seed(name, role, text, stars, sort)
where not exists (select 1 from web_reviews);

-- ✅ ตรวจผล: ต้องเห็นรีวิว 3 แถว
select id, name, role, stars, sort, active from web_reviews order by sort;
