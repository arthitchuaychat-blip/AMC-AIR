-- 164: เบรกบอท AI ใน LINE (รีวิว "กลาง" ข้อ 24)
--
-- ปัญหา: บอทตอบทุกข้อความไม่จำกัด ไม่มีเพดานต่อห้อง ไม่มีเพดานต่อวัน
-- และไม่รู้ว่าพนักงานรับช่วงคุยไปแล้ว → แทรกทับตอนกำลังปิดการขายอยู่
-- ข้อความตายตัวนอกเวลามี cooldown ของตัวเองอยู่แล้ว (mig 073) แต่บอท AI ไม่มีเลย
--
-- ai_off = ปิดบอทเฉพาะห้องนั้น ไว้ใช้ตอนพนักงานกำลังคุยปิดการขายเอง ไม่อยากให้บอทแทรก
-- index = ไว้ให้เช็ค "พนักงานเพิ่งตอบไปหรือยัง" และนับจำนวนคำตอบย้อนหลังได้เร็ว

alter table line_contacts add column if not exists ai_off boolean not null default false;

create index if not exists line_messages_conv_out_idx
  on line_messages (line_user_id, direction, created_at desc);

comment on column line_contacts.ai_off is 'ปิดบอท AI เฉพาะห้องนี้ — ใช้ตอนพนักงานคุยปิดการขายเอง';

-- ✅ ตรวจผล: ต้องได้ 2 แถว
-- select 'col' as kind, column_name as name from information_schema.columns
--   where table_name = 'line_contacts' and column_name = 'ai_off'
-- union all
-- select 'idx', indexname from pg_indexes where indexname = 'line_messages_conv_out_idx';
