-- 189: แชตลูกค้า — โน้ต + แท็กผู้ติดต่อ (LINE+FB) · FB quote-reply (fb_messages.quoted_message_id)
alter table line_contacts add column if not exists note text;
alter table line_contacts add column if not exists tags text[];
alter table fb_contacts   add column if not exists note text;
alter table fb_contacts   add column if not exists tags text[];
alter table fb_messages   add column if not exists quoted_message_id text;   -- mid ที่ตอบกลับ (FB reply)

-- rollback:
-- alter table line_contacts drop column if exists note; alter table line_contacts drop column if exists tags;
-- alter table fb_contacts drop column if exists note; alter table fb_contacts drop column if exists tags;
-- alter table fb_messages drop column if exists quoted_message_id;
