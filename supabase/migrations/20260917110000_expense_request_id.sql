-- v847 · กันส่งคำขอเบิกจ่ายซ้ำ "ระดับฐานข้อมูล" (ต่อยอดจาก doc_request_id v844 — แบบเดียวกัน)
-- request_id = UUID ที่แอปสร้างตอน "เปิดฟอร์มขอเบิก 1 ครั้ง" → กดซ้ำ/retry หลังเน็ตหลุด = ค่าเดิม → unique ปฏิเสธใบที่ 2
-- (เดิม submitExpense เป็น insert ตรง: กดซ้ำ = ใบเบิก 2 ใบ → ฝ่ายบัญชีอนุมัติ/จ่ายซ้ำได้)
-- ปลอดภัยต่อข้อมูลเดิม: nullable + partial index · รันซ้ำได้ · ยังไม่รันแอปก็ทำงาน (โค้ดตัด request_id ทิ้งเองถ้าคอลัมน์ไม่มี)
alter table public.expense_requests add column if not exists request_id uuid;
create unique index if not exists expense_requests_request_id_uidx on public.expense_requests(request_id) where request_id is not null;
