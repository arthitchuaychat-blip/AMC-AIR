-- 172: อัลบั้มผลงานเก็บรูปได้ไม่จำกัดต่อ 1 อัลบั้ม (เดิม 1 อัลบั้ม = 1 รูป)
--
-- เดิม web_portfolio มีแค่ image_url (รูปเดียว) → "อัลบั้ม" จริง ๆ คือรูปเดี่ยว ๆ เรียงกัน
-- ทีมกราฟิกต้องสร้างหลายรายการเพื่อโชว์งานเดียวกันหลายมุม และคำบรรยายซ้ำกันทุกใบ
--
-- images = รูปทั้งหมดของอัลบั้ม เรียงตามลำดับที่จัดไว้ · images[1] = รูปปก
-- image_url = รูปปก เก็บไว้เหมือนเดิม เพื่อให้ของเก่ายังทำงาน:
--   · เว็บบันเดิลเก่าที่ค้างในเครื่องลูกค้ายังอ่าน image_url ได้
--   · แท็ก og:image / โครงสร้าง SEO ที่อ้างรูปเดียว
--   ⇒ ฝั่งแอปต้องเขียน image_url = images[1] ทุกครั้งที่บันทึก (ห้ามปล่อยให้ 2 ค่าไม่ตรงกัน)

alter table web_portfolio add column if not exists images text[] not null default '{}';

-- ย้ายของเดิม: อัลบั้มที่มีแต่ image_url → ใส่เป็นรูปแรกของ images (รันซ้ำได้ ไม่ทับของที่ย้ายแล้ว)
update web_portfolio
   set images = array[image_url]
 where image_url is not null
   and coalesce(array_length(images, 1), 0) = 0;

comment on column web_portfolio.images is 'รูปทั้งหมดในอัลบั้ม เรียงตามลำดับ · images[1] = รูปปก (ต้องตรงกับ image_url เสมอ)';

-- ✅ ตรวจผล: ทุกแถวที่มีรูป ต้องมี images อย่างน้อย 1 รูป และรูปแรกต้องตรงกับ image_url
-- select id, title, image_url, images,
--        (images[1] is not distinct from image_url) as ปกตรงกัน
--   from web_portfolio order by sort, id;

-- 🔙 ถอยกลับ (ข้อมูลรูปเพิ่มเติมจะหาย เหลือรูปปกตามเดิม):
-- alter table web_portfolio drop column if exists images;
