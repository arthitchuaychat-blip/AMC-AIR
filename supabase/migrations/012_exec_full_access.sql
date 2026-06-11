-- ผู้บริหาร (exec) มีสิทธิทำได้ทุกอย่าง เท่ากับ/เหนือกว่า ธุรการ (admin)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- วัสดุ
drop policy if exists mat_write on materials;
create policy mat_write on materials for all to authenticated
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));

-- ธุรกรรม: exec ทำได้ทุกทีม/ทุกประเภทเหมือน admin
drop policy if exists txn_insert on transactions;
create policy txn_insert on transactions for insert to authenticated
  with check (my_role() in ('admin','exec') or (my_role() = 'tech' and team = my_team() and type in ('withdraw','return')));
drop policy if exists txn_admin_edit on transactions;
create policy txn_admin_edit on transactions for update to authenticated
  using (my_role() in ('admin','exec'));

-- งาน (job costing)
drop policy if exists jobs_write on jobs;
create policy jobs_write on jobs for all to authenticated
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));

-- ใบสั่งซื้อ
drop policy if exists po_write on purchase_orders;
create policy po_write on purchase_orders for all to authenticated
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));
drop policy if exists poi_write on po_items;
create policy poi_write on po_items for all to authenticated
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));

-- ลูกค้า / ผู้ติดต่อ / ไซต์
drop policy if exists cust_write on customers;
create policy cust_write on customers for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));
drop policy if exists cc_write on customer_contacts;
create policy cc_write on customer_contacts for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));
drop policy if exists cs_write on customer_sites;
create policy cs_write on customer_sites for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));

-- ยี่ห้อ / BTU
drop policy if exists brands_write on brands;
create policy brands_write on brands for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));
drop policy if exists btus_write on btus;
create policy btus_write on btus for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));

-- BOQ
drop policy if exists boq_write on boqs;
create policy boq_write on boqs for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));
drop policy if exists boqi_write on boq_items;
create policy boqi_write on boq_items for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));

-- ใบเสนอราคา
drop policy if exists qt_write on quotations;
create policy qt_write on quotations for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));
drop policy if exists qti_write on quotation_items;
create policy qti_write on quotation_items for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));

-- ใบงาน
drop policy if exists jo_write on job_orders;
create policy jo_write on job_orders for all to authenticated using (my_role() in ('admin','sales','exec')) with check (my_role() in ('admin','sales','exec'));

-- timeline ใบงาน
drop policy if exists jl_insert on job_logs;
create policy jl_insert on job_logs for insert to authenticated with check (
  my_role() in ('admin','sales','exec')
  or (my_role() = 'tech' and exists (select 1 from job_orders j where j.job_no = job_logs.job_no and j.assigned_team = my_team()))
);

-- จัดการผู้ใช้: ผู้บริหาร/ธุรการ แก้/เพิ่มโปรไฟล์ผู้ใช้ได้ทั้งหมด
drop policy if exists prof_mgr_update on profiles;
create policy prof_mgr_update on profiles for update to authenticated
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));
drop policy if exists prof_mgr_insert on profiles;
create policy prof_mgr_insert on profiles for insert to authenticated
  with check (my_role() in ('admin','exec') or id = auth.uid());
