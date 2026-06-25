-- 069_line_reply.sql — รองรับการ "ตอบกลับ (reply)" พร้อมแสดงข้อความที่อ้างอิงในแชต LINE
-- เพิ่มคอลัมน์ (ปลอดภัย รันซ้ำได้): ไม่แตะข้อมูลเดิม
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- ข้อความนี้เป็นการตอบกลับข้อความไหน (อ้างอิง line_message_id ของต้นทาง)
alter table line_messages add column if not exists quoted_message_id text;
-- quoteToken ของข้อความนี้เอง (ใช้ตอนผู้อื่นจะ reply ข้อความนี้กลับไปบน LINE)
alter table line_messages add column if not exists quote_token text;

-- ค้นหาข้อความต้นทางจาก line_message_id ได้เร็ว (ใช้ resolve quote ในหน้าแชต)
create index if not exists idx_line_msg_lineid on line_messages(line_message_id);
