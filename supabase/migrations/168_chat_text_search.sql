-- 168: ค้นข้อความในแชต LINE ได้จากช่องค้นหา
--
-- ช่องค้นหาหน้าแชตเดิมดูแค่ชื่อผู้ติดต่อ ชื่อลูกค้าที่ผูก และ "ข้อความล่าสุด" บรรทัดเดียว
-- ตอนนี้ค้นทั้งประวัติแล้ว (searchLineMessages ยิง ilike '%คำค้น%' ที่ line_messages.text)
--
-- ไฟล์นี้ไม่ใช่ของบังคับ — ฟีเจอร์ทำงานได้อยู่แล้วโดยไม่ต้องรัน
-- แต่ถ้าไม่มี index นี้ Postgres ต้องไล่อ่านทั้งตารางทุกครั้งที่พิมพ์ พอแชตโตหลักแสนข้อความจะเริ่มหน่วง
-- pg_trgm ทำให้ ilike แบบ '%x%' (มี wildcard นำหน้า) ใช้ index ได้ ซึ่ง index ปกติทำไม่ได้
--
-- ⚠️ ใช้เวลาสร้างสักพักถ้าแชตเยอะ · รันตอนร้านไม่ยุ่งจะดีกว่า

create extension if not exists pg_trgm;

create index if not exists line_messages_text_trgm_idx
  on line_messages using gin (text gin_trgm_ops);

-- ✅ ตรวจผล: ต้องได้ 1 แถว
-- select indexname from pg_indexes
-- where tablename = 'line_messages' and indexname = 'line_messages_text_trgm_idx';

-- 🔙 ถอยกลับ (ถ้าไม่อยากเก็บ index นี้ไว้):
-- drop index if exists line_messages_text_trgm_idx;
