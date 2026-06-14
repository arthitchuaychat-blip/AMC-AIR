-- เงื่อนไขท้ายเอกสาร 3 หัวข้อ (การชำระเงิน / ชุดวัสดุแถมมาตรฐาน / การรับประกัน)
-- เก็บแยกในทุกเอกสาร + คลัง "แบบมาตรฐาน" ที่เลือกมาใส่แล้วแก้ต่อได้
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table boqs       add column if not exists terms_payment text, add column if not exists terms_freebies text, add column if not exists terms_warranty text;
alter table quotations add column if not exists terms_payment text, add column if not exists terms_freebies text, add column if not exists terms_warranty text;
alter table invoices   add column if not exists terms_payment text, add column if not exists terms_freebies text, add column if not exists terms_warranty text;
alter table receipts   add column if not exists terms_payment text, add column if not exists terms_freebies text, add column if not exists terms_warranty text;

-- คลังแบบมาตรฐาน (เลือกมาใส่ในเอกสารแล้วแก้เพิ่มได้) — ใช้ร่วมกันทั้งทีม
create table if not exists doc_term_presets (
  id         bigint generated always as identity primary key,
  category   text not null check (category in ('payment','freebies','warranty')),
  title      text not null,
  body       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
alter table doc_term_presets enable row level security;
create policy dtp_read  on doc_term_presets for select to authenticated using (true);
create policy dtp_write on doc_term_presets for all to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ตัวอย่างเริ่มต้น (ลบ/แก้/เพิ่มได้ในแอป)
insert into doc_term_presets (category, title, body, sort) values
  ('payment','มัดจำ 50% ที่เหลือเมื่อเสร็จงาน', E'ชำระมัดจำ 50% เมื่อตกลงจ้างงาน\nส่วนที่เหลือ 50% ชำระเมื่อติดตั้งแล้วเสร็จ', 1),
  ('payment','ชำระเต็มจำนวนก่อนเริ่มงาน', 'ชำระเต็มจำนวนก่อนเริ่มดำเนินการติดตั้ง', 2),
  ('freebies','ชุดวัสดุแถมมาตรฐาน (ติดตั้งแอร์)', E'ฟรี! ท่อน้ำยาแอร์ 4 เมตร\nฟรี! สายไฟ + ท่อร้อยสายไฟ 4 เมตร\nฟรี! รางครอบท่อ\nฟรี! ขายึดคอมเพรสเซอร์', 1),
  ('warranty','รับประกัน 1 ปี', E'รับประกันงานติดตั้ง 1 ปี\nรับประกันคอมเพรสเซอร์ตามเงื่อนไขผู้ผลิต\nไม่รวมความเสียหายจากการใช้งานผิดประเภทหรือภัยธรรมชาติ', 1)
on conflict do nothing;
