-- 034 · ใบงานเชื่อม (job group) — 1 ใบเสนอราคา/งาน แตกได้หลายใบ (...1409, 1409A, 1409B)
--      ใบในกลุ่มเดียวกันใช้ group_no ร่วมกัน (= เลขใบราก) เพื่อเชื่อมโยง + กระดานความเคลื่อนไหวร่วมกัน
alter table job_orders add column if not exists group_no text;
create index if not exists idx_job_orders_group on job_orders(group_no);
