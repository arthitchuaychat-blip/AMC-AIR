-- ปิดบอท AI เฉพาะห้องแชต Facebook (เทียบเท่า line_contacts.ai_off ใน mig 164)
-- ใช้ตอนพนักงานกำลังคุยปิดการขายเอง ไม่อยากให้บอท AI แทรก
alter table fb_contacts add column if not exists ai_off boolean not null default false;
comment on column fb_contacts.ai_off is 'ปิดบอท AI เฉพาะห้องนี้ (FB) — ใช้ตอนพนักงานคุยปิดการขายเอง';
