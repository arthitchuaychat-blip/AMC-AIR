-- 141: HR ใบลา — เพิ่มประเภท "ลาไม่รับค่าแรง" (unpaid) + ลาราย ชม. (hours/time_from/time_to)
-- ลาไม่รับค่าแรง: ไม่มีโควตา · พนักงานรายเดือนถูกหักค่าแรงอัตโนมัติในรอบเงินเดือน (ผ่านช่องหักลาเกินสิทธิ์)
-- ลาราย ชม.: 8 ชม. = 1 วัน — days ในแถวเก็บเป็นเศษวัน (เช่น 2 ชม. = 0.25) โควตา/เงินเดือนคิดต่อเนื่องเอง

alter table hr_leaves drop constraint if exists hr_leaves_type_check;
alter table hr_leaves add constraint hr_leaves_type_check
  check (type in ('sick','personal','vacation','unpaid'));

alter table hr_leaves add column if not exists hours     numeric;  -- จำนวนชั่วโมง (null = ลาเต็มวัน)
alter table hr_leaves add column if not exists time_from text;     -- 'HH:MM' เวลาเริ่มลา
alter table hr_leaves add column if not exists time_to   text;     -- 'HH:MM' เวลาสิ้นสุด
