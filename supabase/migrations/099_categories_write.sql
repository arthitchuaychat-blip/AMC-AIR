-- 099_categories_write.sql — เปิดสิทธิ์เพิ่ม/แก้/ลบ "หมวดวัสดุ" (ตาราง categories มีแต่ policy อ่าน)
-- ใช้ role ชุดเดียวกับคนที่แก้แคตตาล็อกสินค้าได้ (mat_write หลัง 095) · รันครั้งเดียว

drop policy if exists cat_write on categories;
create policy cat_write on categories for all to authenticated
  using (my_role() in ('admin','exec','finance','stock','sales','hr'))
  with check (my_role() in ('admin','exec','finance','stock','sales','hr'));
