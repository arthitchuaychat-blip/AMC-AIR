-- ตำแหน่งใหม่: หัวหน้าช่าง (lead_tech) · ธุรการวัสดุ (stock) · บัญชี/การเงิน (finance)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
--   finance = เต็มสิทธิ์เท่าธุรการ
--   stock   = จัดการคลังเต็มสิทธิ์ (วัสดุ/เบิก-คืน-ซื้อ-ตัดเสีย/ใบสั่งซื้อ/งาน)
--   lead_tech = คุมงานทุกทีม (อัปเดตสถานะ/ไทม์ไลน์ + เบิก/คืนได้ทุกทีม)

-- อนุญาตค่าบทบาทใหม่ในตาราง profiles (สำคัญ — ไม่งั้นบันทึกบทบาทใหม่ไม่ได้)
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('exec','admin','finance','sales','stock','lead_tech','tech'));

-- วัสดุ
drop policy if exists mat_write on materials;
create policy mat_write on materials for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));

-- ธุรกรรม
drop policy if exists txn_read on transactions;
create policy txn_read on transactions for select to authenticated
  using (my_role() in ('admin','exec','finance','stock','lead_tech') or team = my_team());
drop policy if exists txn_insert on transactions;
create policy txn_insert on transactions for insert to authenticated
  with check (
    my_role() in ('admin','exec','finance','stock')
    or (my_role() = 'tech' and team = my_team() and type in ('withdraw','return'))
    or (my_role() = 'lead_tech' and type in ('withdraw','return'))
  );
drop policy if exists txn_admin_edit on transactions;
create policy txn_admin_edit on transactions for update to authenticated
  using (my_role() in ('admin','exec','finance','stock'));

-- งาน (job costing)
drop policy if exists jobs_write on jobs;
create policy jobs_write on jobs for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));

-- ใบสั่งซื้อ
drop policy if exists po_write on purchase_orders;
create policy po_write on purchase_orders for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));
drop policy if exists poi_write on po_items;
create policy poi_write on po_items for all to authenticated
  using (my_role() in ('admin','exec','finance','stock')) with check (my_role() in ('admin','exec','finance','stock'));

-- ลูกค้า / ผู้ติดต่อ / ไซต์ (เพิ่ม finance)
drop policy if exists cust_write on customers;
create policy cust_write on customers for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
drop policy if exists cc_write on customer_contacts;
create policy cc_write on customer_contacts for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
drop policy if exists cs_write on customer_sites;
create policy cs_write on customer_sites for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ยี่ห้อ / BTU (เพิ่ม finance + stock)
drop policy if exists brands_write on brands;
create policy brands_write on brands for all to authenticated using (my_role() in ('admin','sales','exec','finance','stock')) with check (my_role() in ('admin','sales','exec','finance','stock'));
drop policy if exists btus_write on btus;
create policy btus_write on btus for all to authenticated using (my_role() in ('admin','sales','exec','finance','stock')) with check (my_role() in ('admin','sales','exec','finance','stock'));

-- BOQ (เพิ่ม finance)
drop policy if exists boq_write on boqs;
create policy boq_write on boqs for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
drop policy if exists boqi_write on boq_items;
create policy boqi_write on boq_items for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ใบเสนอราคา (เพิ่ม finance)
drop policy if exists qt_write on quotations;
create policy qt_write on quotations for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
drop policy if exists qti_write on quotation_items;
create policy qti_write on quotation_items for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- ใบงาน (เพิ่ม finance) + หัวหน้าช่างอัปเดตสถานะได้ทุกทีม
drop policy if exists jo_write on job_orders;
create policy jo_write on job_orders for all to authenticated using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));
drop policy if exists jo_lead_update on job_orders;
create policy jo_lead_update on job_orders for update to authenticated using (my_role() = 'lead_tech') with check (my_role() = 'lead_tech');

-- timeline ใบงาน (เพิ่ม finance + lead_tech)
drop policy if exists jl_insert on job_logs;
create policy jl_insert on job_logs for insert to authenticated with check (
  my_role() in ('admin','sales','exec','finance','lead_tech')
  or (my_role() = 'tech' and exists (select 1 from job_orders j where j.job_no = job_logs.job_no and j.assigned_team = my_team()))
);

-- จัดการผู้ใช้: เพิ่ม finance
drop policy if exists prof_mgr_update on profiles;
create policy prof_mgr_update on profiles for update to authenticated
  using (my_role() in ('admin','exec','finance')) with check (my_role() in ('admin','exec','finance'));
drop policy if exists prof_mgr_insert on profiles;
create policy prof_mgr_insert on profiles for insert to authenticated
  with check (my_role() in ('admin','exec','finance') or id = auth.uid());
