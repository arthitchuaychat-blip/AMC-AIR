-- 127_stock_view_definer.sql — ยอดคงเหลือ (material_stock) ต้องเป็นเลขจริงเสมอ ไม่ขึ้นกับสิทธิ์ของคนดู
-- เดิม view เป็น security_invoker: คำนวณจาก "รายการที่คนเรียกมองเห็น" → บทบาทที่อ่าน transactions ไม่ได้
-- (เช่น ธุรการวัสดุก่อน mig 126 · ฝ่ายขาย/HR) เห็นคงเหลือ 0 ทั้งคลัง และการนับสต๊อกที่กดโดยบทบาทนั้น
-- เทียบกับ 0 → บวกยอดนับทับของเดิม
-- ยอดคงเหลือเป็นข้อมูลที่ทุกคนในบริษัทควรเห็นตรงกัน → ให้ view คำนวณจากรายการทั้งหมด (definer)
-- ส่วนสิทธิ์ดู "รายการเคลื่อนไหวดิบ" ยังคุมด้วย policy บนตาราง transactions เหมือนเดิม
-- รันใน Supabase → SQL Editor (ครั้งเดียว · รันซ้ำได้)

alter view material_stock set (security_invoker = off);

-- ✅ ตรวจผล: ต้องไม่มี security_invoker=true ค้างอยู่
select relname, reloptions from pg_class where relname = 'material_stock';
