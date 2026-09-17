-- v844 · กันบันทึกเอกสารเงินซ้ำ "ระดับฐานข้อมูล" (ชั้นสอง ต่อจาก busy guard ฝั่งจอ v842-843)
--
-- request_id = UUID ที่แอปสร้าง "ตอนเปิดฟอร์ม 1 ครั้ง" แล้วส่งมากับใบตอนบันทึก
--   · กดซ้ำ / เน็ตหลุดแล้ว retry / แท็บค้างแล้วกดใหม่  → request_id เดิม → unique index ปฏิเสธใบที่ 2
--     (แอปจับ 23505 บน request_id แล้วถือว่า "บันทึกไปแล้ว" ไม่ใช่ error — ผู้ใช้เห็นใบเดียว)
--   · เปิดฟอร์มใหม่ (ออกใบใหม่ / จ่ายงวดถัดไป)              → request_id ใหม่ → ผ่านตามปกติ
--   ⇒ แยก "กดจ่ายครั้งเดิมซ้ำ" ออกจาก "จ่ายบางส่วนรอบใหม่" ได้ ตามที่ตกลงในแผน (ไม่ขวางงานที่ถูกต้อง)
--
-- ปลอดภัยต่อข้อมูลเดิม: คอลัมน์ nullable · index แบบ partial (where not null) → ใบเก่าที่ไม่มี request_id ไม่กระทบ
-- รันซ้ำได้ (if not exists ทุกบรรทัด) · ยังไม่รันแอปก็ทำงานได้ (โค้ดตัด request_id ทิ้งเองถ้าคอลัมน์ไม่มี)

alter table public.receipts         add column if not exists request_id uuid;
alter table public.invoices         add column if not exists request_id uuid;
alter table public.adjustment_notes add column if not exists request_id uuid;
alter table public.billing_notes    add column if not exists request_id uuid;

create unique index if not exists receipts_request_id_uidx         on public.receipts(request_id)         where request_id is not null;
create unique index if not exists invoices_request_id_uidx         on public.invoices(request_id)         where request_id is not null;
create unique index if not exists adjustment_notes_request_id_uidx on public.adjustment_notes(request_id) where request_id is not null;
create unique index if not exists billing_notes_request_id_uidx    on public.billing_notes(request_id)    where request_id is not null;
