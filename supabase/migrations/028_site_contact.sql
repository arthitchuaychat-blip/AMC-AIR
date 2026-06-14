-- 028 · ไซต์งาน (customer_sites) เก็บผู้ติดต่อ + เบอร์โทร ของไซต์นั้นเอง
--      โมเดลใหม่: ลูกค้า 1 ราย (แยกด้วยชื่อ) มีได้หลายไซต์ · แต่ละไซต์มี
--      ชื่อผู้ติดต่อ · เบอร์โทร · ที่อยู่ · หมุดแผนที่ ของตัวเอง
alter table customer_sites add column if not exists contact_name text;
alter table customer_sites add column if not exists phone text;
