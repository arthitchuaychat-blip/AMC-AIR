-- 082_new_roles.sql — เพิ่ม 3 ตำแหน่ง: hr (ฝ่ายบุคคล), graphic (กราฟิก), maid (แม่บ้าน)
-- (1) ขยาย check constraint ของ profiles.role  (2) เปิด RLS ให้บทบาทใหม่เข้าตารางที่ใช้
-- teamchat/tasks/expenses(ของตัวเอง)/profiles-read/materials-read เปิดให้ทุกคนอยู่แล้ว → maid ใช้ได้ทันที
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- (1) อนุญาตบทบาทใหม่ (ลบ check เดิมที่จำกัด role ทั้งหมด แล้วสร้างใหม่)
do $$
declare cn text;
begin
  for cn in select conname from pg_constraint
            where conrelid = 'public.profiles'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%role%in%' loop
    execute format('alter table profiles drop constraint %I', cn);
  end loop;
  alter table profiles add constraint profiles_role_check
    check (role in ('exec','admin','finance','hr','sales','graphic','stock','lead_tech','tech','maid'));
end $$;

-- (2a) ฝ่ายบุคคล (hr) → ตาราง HR + อัปเดตข้อมูลพนักงาน
drop policy if exists hr_att_self on hr_attendance;
create policy hr_att_self on hr_attendance for all
  using (user_id = auth.uid() or my_role() in ('admin','exec','hr'))
  with check (user_id = auth.uid() or my_role() in ('admin','exec','hr'));

drop policy if exists hr_leaves_self on hr_leaves;
create policy hr_leaves_self on hr_leaves for all
  using (user_id = auth.uid() or my_role() in ('admin','exec','hr'))
  with check (user_id = auth.uid() or my_role() in ('admin','exec','hr'));

drop policy if exists hr_holidays_write on hr_holidays;
create policy hr_holidays_write on hr_holidays for all
  using (my_role() in ('admin','exec','hr')) with check (my_role() in ('admin','exec','hr'));

drop policy if exists hr_quota_write on hr_leave_quota;
create policy hr_quota_write on hr_leave_quota for all
  using (my_role() in ('admin','exec','hr')) with check (my_role() in ('admin','exec','hr'));

drop policy if exists payslips_rw on payslips;
create policy payslips_rw on payslips for all
  using (my_role() in ('admin','exec','finance','hr')) with check (my_role() in ('admin','exec','finance','hr'));

drop policy if exists hr_advances_self on hr_advances;
create policy hr_advances_self on hr_advances for all
  using (user_id = auth.uid() or my_role() in ('admin','exec','finance','hr'))
  with check (user_id = auth.uid() or my_role() in ('admin','exec','finance','hr'));

-- hr ตั้งค่า/แก้ข้อมูลพนักงาน (ฐานเงินเดือน, กะ ฯลฯ)
drop policy if exists prof_mgr_update on profiles;
create policy prof_mgr_update on profiles for update to authenticated
  using (my_role() in ('admin','exec','finance','hr'))
  with check (my_role() in ('admin','exec','finance','hr') or id = auth.uid());

-- (2b) กราฟิก (graphic) → เนื้อหาเว็บ + คำสั่งซื้อจากเว็บ (อ่าน)
drop policy if exists wc_write on web_clients;
create policy wc_write on web_clients for all to authenticated
  using (my_role() in ('admin','sales','exec','graphic')) with check (my_role() in ('admin','sales','exec','graphic'));

drop policy if exists wb_write on web_banners;
create policy wb_write on web_banners for all to authenticated
  using (my_role() in ('admin','sales','exec','graphic')) with check (my_role() in ('admin','sales','exec','graphic'));

drop policy if exists wad_write on web_ads;
create policy wad_write on web_ads for all to authenticated
  using (my_role() in ('admin','sales','exec','graphic')) with check (my_role() in ('admin','sales','exec','graphic'));

do $$ declare t text; begin
  foreach t in array array['web_portfolio','web_articles','web_press'] loop
    execute format('drop policy if exists wcnt_write on %I', t);
    execute format($p$create policy wcnt_write on %I for all to authenticated
      using (my_role() in ('admin','sales','exec','graphic')) with check (my_role() in ('admin','sales','exec','graphic'))$p$, t);
  end loop;
end $$;

drop policy if exists web_orders_read on web_orders;
create policy web_orders_read on web_orders for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','graphic'));
