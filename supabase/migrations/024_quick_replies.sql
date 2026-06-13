-- ข้อความตอบกลับสำเร็จรูป (canned replies) สำหรับกล่องแชต LINE — ใช้ร่วมกันทั้งทีมออฟฟิศ
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create table if not exists quick_replies (
  id         bigint generated always as identity primary key,
  text       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

alter table quick_replies enable row level security;
create policy qr_read on quick_replies for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','lead_tech'));
create policy qr_write on quick_replies for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ตัวอย่างเริ่มต้น (ลบ/แก้ได้ในแอป)
insert into quick_replies (text, sort) values
  ('สวัสดีครับ ทาง AMC AIR ยินดีให้บริการครับ 🙏', 1),
  ('รบกวนขอที่อยู่หน้างาน + เบอร์ติดต่อ และเวลาที่สะดวกให้ช่างเข้าครับ', 2),
  ('ขอบคุณครับ ทางเราได้รับเรื่องแล้ว เดี๋ยวประสานช่างให้นะครับ', 3)
on conflict do nothing;
