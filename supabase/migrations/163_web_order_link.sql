-- 163: ผูกคำสั่งซื้อจากเว็บเข้ากับลูกค้า/BOQ (รีวิว "กลาง" ข้อ 25)
--
-- ปัญหา: คำสั่งซื้อจากหน้าเว็บเป็นทางตัน — หน้าเดียวที่ทำได้คือเปลี่ยนสถานะ
-- จะทำใบเสนอราคาให้ลูกค้ารายนั้นต้องพิมพ์ชื่อ/ที่อยู่/เบอร์/รายการสินค้า เข้าระบบใหม่ทั้งหมดด้วยมือ
-- ระหว่างพิมพ์ใหม่ก็พิมพ์ตกได้ และไม่มีอะไรเชื่อมกลับว่าใบเสนอราคาใบไหนมาจากคำสั่งซื้อไหน
--
-- customer_id มีอยู่แล้วตั้งแต่ mig 071 แต่ไม่เคยมีโค้ดไหนเขียนค่าลงไปเลย
-- เพิ่ม boq_no เพื่อให้ตามรอยได้ว่าคำสั่งซื้อนี้กลายเป็นเอกสารใบไหนแล้ว (และกันทำซ้ำ)

alter table web_orders add column if not exists boq_no text;

create index if not exists web_orders_customer_idx on web_orders (customer_id);

comment on column web_orders.boq_no is 'เลข BOQ ที่สร้างจากคำสั่งซื้อนี้ — มีค่าแล้วแปลว่าแปลงเป็นเอกสารในระบบไปแล้ว';

-- ✅ ตรวจผล: ต้องได้ 1 แถว
-- select column_name from information_schema.columns
-- where table_name = 'web_orders' and column_name = 'boq_no';
