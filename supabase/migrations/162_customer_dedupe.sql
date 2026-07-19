-- 162: ช่วยค้นลูกค้าซ้ำให้เร็ว (รีวิว "กลาง" ข้อ 27)
--
-- ปัญหา: สร้างลูกค้าซ้ำได้ไม่จำกัด ไม่มีตัวเตือนทั้งตอนกรอกมือและตอนนำเข้าไฟล์
-- ลูกค้ารายเดียวจึงกระจายเป็นหลายราย ประวัติงาน/ยอดค้างรับ/รอบติดตามแตกออกจากกัน
-- เซลล์เห็นว่า "ไม่เคยซื้อ" ทั้งที่ซื้อไปแล้ว และตามหนี้ผิดคน
--
-- index นี้ทำให้การค้นด้วย "เลขผู้เสียภาษีเฉพาะตัวเลข" เร็วพอจะเช็คตอนกดบันทึกได้
-- (ของเดิมบางรายเก็บมีขีด/เว้นวรรค เทียบตรง ๆ ไม่เจอ)
--
-- ⚠️ ตั้งใจไม่ทำ unique constraint บนเลขผู้เสียภาษี:
--    ข้อมูลเดิมอาจมีซ้ำอยู่แล้ว migration จะล้มทั้งไฟล์
--    และร้านมีเคสจริงที่บุคคลธรรมดาใช้เลขบัตรเดียวกับกิจการตัวเอง
--    → กันซ้ำที่ชั้นแอป (เตือน + ให้เลือกใช้รายเดิม) ปลอดภัยกว่าและอธิบายให้ผู้ใช้เข้าใจได้

create index if not exists customers_taxid_digits_idx
  on customers ((regexp_replace(coalesce(tax_id, ''), '\D', '', 'g')))
  where tax_id is not null and tax_id <> '';

create index if not exists customer_contacts_phone_digits_idx
  on customer_contacts ((regexp_replace(coalesce(phone, ''), '\D', '', 'g')))
  where phone is not null and phone <> '';

create index if not exists customer_sites_phone_digits_idx
  on customer_sites ((regexp_replace(coalesce(phone, ''), '\D', '', 'g')))
  where phone is not null and phone <> '';

-- 🔎 อยากรู้ว่ามีซ้ำอยู่เท่าไรแล้ว รันอันนี้ดูได้ (ไม่บังคับ):
-- select regexp_replace(tax_id, '\D', '', 'g') as tid, count(*), string_agg(name, ' · ')
-- from customers where tax_id is not null and tax_id <> ''
-- group by 1 having count(*) > 1 order by 2 desc;

-- ✅ ตรวจผล: ต้องได้ 3 แถว
-- select indexname from pg_indexes where schemaname = 'public'
--   and indexname in ('customers_taxid_digits_idx','customer_contacts_phone_digits_idx','customer_sites_phone_digits_idx');
