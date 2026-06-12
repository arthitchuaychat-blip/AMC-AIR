-- ที่เก็บรูป (Storage) สำหรับ ใบงาน · วัสดุ · ไทม์ไลน์ช่าง · บรีฟฝ่ายขาย
-- รันใน Supabase → SQL Editor (ครั้งเดียว) — แก้ปัญหา "Bucket not found"

-- 1) สร้าง bucket ชื่อ photos แบบสาธารณะ (ลิงก์รูปเปิดดูได้)
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do update set public = true;

-- 2) สิทธิ์: ใครก็เปิดดูรูปได้ (public URL) · ผู้ที่ล็อกอินอัปโหลด/แก้/ลบได้
drop policy if exists "photos_read"   on storage.objects;
create policy "photos_read"   on storage.objects for select using (bucket_id = 'photos');
drop policy if exists "photos_insert" on storage.objects;
create policy "photos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'photos');
drop policy if exists "photos_update" on storage.objects;
create policy "photos_update" on storage.objects for update to authenticated using (bucket_id = 'photos') with check (bucket_id = 'photos');
drop policy if exists "photos_delete" on storage.objects;
create policy "photos_delete" on storage.objects for delete to authenticated using (bucket_id = 'photos');
