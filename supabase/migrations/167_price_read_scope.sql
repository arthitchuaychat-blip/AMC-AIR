-- 167: ปิดสิทธิ์อ่านตารางราคาของช่าง (รีวิว "กลาง" ข้อ 15) · ส่วนที่ 2/2
--
-- ⚠️⚠️ ห้ามรันไฟล์นี้ก่อนที่แอปเวอร์ชัน v478 ขึ้นไปจะขึ้น production แล้ว ⚠️⚠️
--     บันเดิลเก่าที่ยังค้างในเครื่องช่างอ่าน quotations ตรง ๆ อยู่ — รันก่อน deploy = จอช่างพัง
--     ลำดับที่ถูก: (1) deploy แอป → (2) เปิดแอปด้วยบัญชีช่างดูว่างานยังขึ้นครบ → (3) ค่อยรันไฟล์นี้
--
-- ที่มา: จอช่างอ่านใบงานผ่าน jobs_for_team (mig 166) ซึ่งเป็น security definer จึงไม่ต้องใช้สิทธิ์ตรง
--        ตารางราคาจึงปิดสำหรับช่างได้แล้ว
--
-- ⚠️ policy เดิมเป็นแบบ "ทุกคนที่ล็อกอินอ่านได้" (using true) ไม่มี policy เฉพาะ tech ให้ถอน
--    จึงต้อง drop แล้วสร้างใหม่พร้อมรายชื่อ role ที่อนุญาต = กระทบทุก role พร้อมกัน ต้องระบุให้ครบ
--
-- ทำไมต้องมี 'stock' ในรายชื่อ (ห้ามลืม):
--    ธุรการวัสดุมีเมนู "ใบสั่งซื้อ" และ "เตรียมวัสดุ" ซึ่งอ่าน quotations เพื่อเอาชื่อลูกค้า/ชื่องาน
--    RLS ที่ปฏิเสธจะคืน "ไม่มีแถว" ไม่ใช่ error → สองหน้านั้นจะขึ้นชื่อลูกค้าว่างเปล่าแบบเงียบ ๆ
-- 'hr' ก็ต้องมี — มีสิทธิ์เมนู BOQ/ใบเสนอราคาเต็ม และหน้าประสิทธิผลอ่านใบงาน+ใบเสนอ

-- ---------- ใบเสนอราคา ----------
drop policy if exists qt_read      on quotations;
drop policy if exists qt_write_sel on quotations;      -- ตัวที่ mig 156 สร้างไว้ (select using true)
create policy qt_read on quotations for select to authenticated
  using (my_role() in ('admin','exec','finance','sales','stock','hr'));

drop policy if exists qti_read      on quotation_items;
drop policy if exists qti_write_sel on quotation_items;
create policy qti_read on quotation_items for select to authenticated
  using (my_role() in ('admin','exec','finance','sales','stock','hr'));

-- ---------- BOQ (มีต้นทุนจากผู้ขาย — อ่อนไหวกว่าราคาขายอีก) ----------
drop policy if exists boq_read       on boqs;
drop policy if exists boq_write_sel  on boqs;
create policy boq_read on boqs for select to authenticated
  using (my_role() in ('admin','exec','finance','sales','stock','hr'));

drop policy if exists boqi_read      on boq_items;
drop policy if exists boqi_write_sel on boq_items;
create policy boqi_read on boq_items for select to authenticated
  using (my_role() in ('admin','exec','finance','sales','stock','hr'));

-- 📌 ที่ยัง "ไม่" ปิดในไฟล์นี้ และตั้งใจไม่ปิด — บันทึกไว้ให้คนอ่านทีหลังรู้ว่าไม่ได้ลืม:
--    job_orders / job_visits / customers / customer_sites ยังเป็น using(true)
--    ช่างต้องอ่านได้อยู่แล้วเพื่อกดอัปเดตสถานะงาน และไม่มีข้อมูลราคาในนั้น
--    ⇒ jobs_for_team เป็นตัวลด "ปริมาณข้อมูลที่ส่งลงเครื่อง" ไม่ใช่กำแพงความลับของตาราง 4 ตัวนี้

-- ✅ ตรวจผล: ต้องได้ 4 แถว และคอลัมน์ qual ต้องมีรายชื่อ role (ไม่ใช่ true)
-- select tablename, policyname, qual from pg_policies
-- where schemaname='public' and policyname in ('qt_read','qti_read','boq_read','boqi_read')
-- order by tablename;

-- 🔙 ถ้าต้องถอยกลับด่วน (จอไหนพัง) — คืนสิทธิ์อ่านให้ทุกคนที่ล็อกอินเหมือนเดิม:
-- drop policy if exists qt_read on quotations;
-- create policy qt_read on quotations for select to authenticated using (true);
-- drop policy if exists qti_read on quotation_items;
-- create policy qti_read on quotation_items for select to authenticated using (true);
-- drop policy if exists boq_read on boqs;
-- create policy boq_read on boqs for select to authenticated using (true);
-- drop policy if exists boqi_read on boq_items;
-- create policy boqi_read on boq_items for select to authenticated using (true);
