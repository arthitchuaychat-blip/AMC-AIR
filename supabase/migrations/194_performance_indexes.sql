-- 194_performance_indexes.sql — ดัชนี (index) เร่งความเร็ว query ที่ยิงบ่อย/หนัก ลดภาระ CPU ของ Postgres
-- ปลอดภัย: ทุกตัวเป็น "create index if not exists" (มีอยู่แล้วข้าม · ไม่กระทบข้อมูล)
-- แนะนำรันหลังอัปเกรด compute (ตอนสร้าง index กิน CPU นิดหน่อย แต่ตารางเล็ก ~เร็ว)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

-- แจ้งเตือน (poll ทุก 60 วิ/คน — ตัวที่ยิงถี่สุด): user + เฉพาะที่ยังไม่อ่าน
create index if not exists notifications_user_unread_idx on notifications(user_id) where read_at is null;

-- แชตลูกค้า LINE/FB — นับค้างอ่าน + เรียงล่าสุด
create index if not exists line_contacts_unread_idx  on line_contacts(unread) where unread > 0;
create index if not exists line_contacts_last_idx    on line_contacts(last_message_at desc);
create index if not exists fb_contacts_unread_idx    on fb_contacts(unread) where unread > 0;

-- ข้อความแชต — โหลดต่อผู้ติดต่อ/ห้อง เรียงเวลา
create index if not exists line_messages_user_time_idx on line_messages(line_user_id, created_at desc);
create index if not exists fb_messages_psid_time_idx   on fb_messages(psid, created_at desc);
create index if not exists chat_messages_room_time_idx on chat_messages(room_id, created_at desc);

-- ใบงาน — เรียงล่าสุด + กรองสถานะ · รอบเข้างานต่อใบ
create index if not exists job_orders_created_idx on job_orders(created_at desc);
create index if not exists job_orders_status_idx  on job_orders(status);
create index if not exists job_visits_job_idx     on job_visits(job_no);

-- ใบเสนอราคา + รายการในใบเสนอ (ดึงบ่อยทุกสายเอกสาร)
create index if not exists quotations_created_idx      on quotations(created_at desc);
create index if not exists quotation_items_quote_idx   on quotation_items(quote_no);

-- ✅ ตรวจผล
select 'performance indexes ready' as status;
