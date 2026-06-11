-- Allow all signed-in users to read profile names (needed for per-salesperson/technician reports on the dashboard)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
drop policy if exists prof_read on profiles;
create policy prof_read on profiles for select to authenticated using (true);
