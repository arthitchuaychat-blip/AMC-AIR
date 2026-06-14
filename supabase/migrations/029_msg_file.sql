-- 029 · เก็บไฟล์/วิดีโอ/เสียง/พิกัด ที่ลูกค้าส่งมาทางแชต (เปิด/ดาวน์โหลดได้)
alter table line_messages add column if not exists file_url text;
alter table line_messages add column if not exists file_name text;
