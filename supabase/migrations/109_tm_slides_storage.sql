-- 109_tm_slides_storage.sql — The Top Mentor: bucket เก็บไฟล์สไลด์สมาชิก (ONEPAGE / 121 / 5 นาที)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
-- ไฟล์เก็บ path: tm_slides/<member_id>/<slide>_<timestamp>.<ext> — bucket public อ่านได้ทุกคน, anon อัพโหลด/ลบได้ (แอปไม่มี login)

insert into storage.buckets (id, name, public)
values ('tm_slides', 'tm_slides', true)
on conflict (id) do nothing;

drop policy if exists tm_slides_read on storage.objects;
create policy tm_slides_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'tm_slides');

drop policy if exists tm_slides_insert on storage.objects;
create policy tm_slides_insert on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'tm_slides');

drop policy if exists tm_slides_update on storage.objects;
create policy tm_slides_update on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'tm_slides') with check (bucket_id = 'tm_slides');

drop policy if exists tm_slides_delete on storage.objects;
create policy tm_slides_delete on storage.objects
  for delete to anon, authenticated using (bucket_id = 'tm_slides');
