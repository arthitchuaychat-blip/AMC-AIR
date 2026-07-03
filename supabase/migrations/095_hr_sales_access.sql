-- 095_hr_sales_access.sql — ให้ HR เขียน/อ่านข้อมูลฝ่ายขายได้เหมือน sales (RLS ชั้นที่ 2)
-- มิเรอร์ทุก policy ที่มี 'sales' ให้เพิ่ม 'hr' · รันครั้งเดียว · ปลอดภัยรันซ้ำ
-- (ชั้น UI ปรับใน permissions.js แล้ว — ถ้าเคยกดบันทึกเมทริกซ์สิทธิ ให้กด "รีเซ็ต HR" ในตั้งค่าด้วย)

-- ลูกค้า + ผู้ติดต่อ + ไซต์
drop policy if exists cust_write on customers;
create policy cust_write on customers for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists cc_write on customer_contacts;
create policy cc_write on customer_contacts for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists cs_write on customer_sites;
create policy cs_write on customer_sites for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));

-- BOQ / ใบเสนอราคา
drop policy if exists boq_write on boqs;
create policy boq_write on boqs for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists boqi_write on boq_items;
create policy boqi_write on boq_items for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists qt_write on quotations;
create policy qt_write on quotations for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists qti_write on quotation_items;
create policy qti_write on quotation_items for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));

-- ใบแจ้งหนี้ / ใบเสร็จ / ใบวางบิล
drop policy if exists inv_write on invoices;
create policy inv_write on invoices for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists rc_write on receipts;
create policy rc_write on receipts for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists bn_write on billing_notes;
create policy bn_write on billing_notes for all to authenticated using (my_role() in ('admin','exec','finance','sales','hr')) with check (my_role() in ('admin','exec','finance','sales','hr'));

-- ใบงาน / นัดหมายหน้างาน / ใบส่งมอบ / เงื่อนไขเอกสาร
drop policy if exists jo_write on job_orders;
create policy jo_write on job_orders for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists jv_write on job_visits;
create policy jv_write on job_visits for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists job_handovers_rw on job_handovers;
create policy job_handovers_rw on job_handovers for all using (created_by = auth.uid() or my_role() in ('admin','exec','sales','finance','lead_tech','hr')) with check (created_by = auth.uid() or my_role() in ('admin','exec','sales','finance','lead_tech','hr'));
drop policy if exists dtp_write on doc_term_presets;
create policy dtp_write on doc_term_presets for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));

-- คลังสินค้า (สร้างสินค้า/ยี่ห้อ/BTU ตอนทำใบเสนอราคา)
drop policy if exists mat_write on materials;
create policy mat_write on materials for all to authenticated using (my_role() in ('admin','exec','finance','stock','sales','hr')) with check (my_role() in ('admin','exec','finance','stock','sales','hr'));
drop policy if exists brands_write on brands;
create policy brands_write on brands for all to authenticated using (my_role() in ('admin','sales','exec','finance','stock','hr')) with check (my_role() in ('admin','sales','exec','finance','stock','hr'));
drop policy if exists btus_write on btus;
create policy btus_write on btus for all to authenticated using (my_role() in ('admin','sales','exec','finance','stock','hr')) with check (my_role() in ('admin','sales','exec','finance','stock','hr'));

-- แชตลูกค้า (LINE / Facebook) + ข้อความด่วน + ผูกลูกค้า
drop policy if exists qr_read on quick_replies;
create policy qr_read on quick_replies for select to authenticated using (my_role() in ('admin','sales','exec','finance','lead_tech','hr'));
drop policy if exists qr_write on quick_replies;
create policy qr_write on quick_replies for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists lc_read on line_contacts;
create policy lc_read on line_contacts for select to authenticated using (my_role() in ('admin','sales','exec','finance','lead_tech','hr'));
drop policy if exists lc_update on line_contacts;
create policy lc_update on line_contacts for update to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists lm_read on line_messages;
create policy lm_read on line_messages for select to authenticated using (my_role() in ('admin','sales','exec','finance','lead_tech','hr'));
drop policy if exists lcc_read on line_contact_customers;
create policy lcc_read on line_contact_customers for select to authenticated using (my_role() in ('admin','sales','exec','finance','lead_tech','hr'));
drop policy if exists lcc_write on line_contact_customers;
create policy lcc_write on line_contact_customers for all to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists fb_contacts_write on fb_contacts;
create policy fb_contacts_write on fb_contacts for all using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists fb_messages_write on fb_messages;
create policy fb_messages_write on fb_messages for all using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));

-- คำสั่งซื้อจากเว็บ (อ่าน/อัปเดตสถานะ)
drop policy if exists web_orders_read on web_orders;
create policy web_orders_read on web_orders for select to authenticated using (my_role() in ('admin','sales','exec','finance','hr'));
drop policy if exists web_orders_update on web_orders;
create policy web_orders_update on web_orders for update to authenticated using (my_role() in ('admin','sales','exec','finance','hr')) with check (my_role() in ('admin','sales','exec','finance','hr'));
