-- 185: ผูกใบขอ OT เข้ากับใบงาน (ช่างกดขอ OT จากใบงานที่ "กำลังทำงาน" ได้)
-- job_no = คีย์ใบงาน (job_orders.job_no, text). ลบใบงาน → set null (ใบขอ OT ยังอยู่)
alter table hr_ot add column if not exists job_no text references job_orders(job_no) on delete set null;
create index if not exists hr_ot_job_idx on hr_ot(job_no);

select 'hr_ot.job_no ready' as status;
