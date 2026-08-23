-- ปักหมุดแชต + เปลี่ยนชื่อลูกค้าในแชต (ทุกแพลตฟอร์ม LINE + FB)
-- pinned = ดันแชตขึ้นด้านบนสุดของรายการ
-- custom_name = ชื่อที่พนักงานตั้งเอง (override ชื่อโปรไฟล์จากแพลตฟอร์ม · sync ไม่ทับ)
alter table line_contacts add column if not exists pinned boolean not null default false;
alter table line_contacts add column if not exists custom_name text;
alter table fb_contacts   add column if not exists pinned boolean not null default false;
alter table fb_contacts   add column if not exists custom_name text;
