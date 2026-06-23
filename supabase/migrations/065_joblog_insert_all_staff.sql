-- 065_joblog_insert_all_staff.sql
-- Fix: หัวหน้าช่าง/ช่าง โพสต์ภาพ+คอมเมนต์ลง timeline ใบงานไม่ได้
--   ("new row violates row-level security policy for table job_logs").
-- The old jl_insert policy on the live DB didn't allow lead_tech (or restricted
-- tech to their own team). The timeline is an append-only log that everyone can
-- already read, so allow any authenticated staff member to post to it.
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

drop policy if exists jl_insert on job_logs;
create policy jl_insert on job_logs for insert to authenticated with check (
  my_role() in ('admin','sales','exec','finance','stock','lead_tech','tech')
);
