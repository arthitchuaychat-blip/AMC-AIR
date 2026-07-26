-- 176: แยกหมวดวัสดุออกเป็น "วัสดุ" vs "อุปกรณ์เสริม/อะไหล่" สำหรับรายงานรายได้/ต้นทุนแยกหมวด (เฟส 2)
-- mat_group ใช้เฉพาะหมวดของ kind=material (id ที่ไม่ขึ้นต้น 'sv-') · null = ถือเป็น "วัสดุ" (ค่าเริ่มต้น)
--   'part' = อุปกรณ์เสริม/อะไหล่ · หมวดบริการ (sv-*) และเครื่องปรับอากาศ (ac) ไม่ใช้คอลัมน์นี้
alter table categories add column if not exists mat_group text
  check (mat_group is null or mat_group in ('material', 'part'));

comment on column categories.mat_group is
  'จัดกลุ่มหมวดวัสดุเพื่อแยกรายได้/ต้นทุน: null|material = วัสดุ, part = อุปกรณ์เสริม/อะไหล่';
