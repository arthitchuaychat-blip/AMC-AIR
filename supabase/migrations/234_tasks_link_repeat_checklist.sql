-- 234: กระดานสั่งงาน — ผูกใบงาน + งานทำซ้ำ + checklist ย่อย
alter table tasks add column if not exists job_no text;                              -- ผูกใบงาน (JOB-xxxx)
alter table tasks add column if not exists repeat_months int not null default 0;      -- 0 = ไม่ทำซ้ำ · N = ทำซ้ำทุก N เดือน (พองานเสร็จจะสร้างงานรอบถัดไปให้อัตโนมัติ)
alter table tasks add column if not exists checklist jsonb not null default '[]'::jsonb; -- รายการย่อย [{t:"...", done:false}, ...]
comment on column tasks.repeat_months is 'งานบำรุงรักษาซ้ำ เช่น ล้างแอร์ทุก 3 เดือน — พอปิดงาน (done) ระบบสร้างงานรอบถัดไป (เลื่อนกำหนด +N เดือน)';
