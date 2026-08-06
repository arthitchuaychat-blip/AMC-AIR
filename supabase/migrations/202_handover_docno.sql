-- 202_handover_docno.sql — เลขที่เอกสารใบส่งมอบงาน (ho_no) ให้อ้างอิง/เชื่อมโยงได้เหมือนเอกสารอื่น
--
-- เดิมใบส่งมอบใช้แค่ uuid ภายใน → ไม่มีเลขสวย ๆ ให้พูดถึง/เชื่อมโยง
-- ho_no รูปแบบ HO-YYMMDD-HHMMSS (เหมือน BOQ/QT/INV/REC) · ออกฝั่ง client ตอนสร้าง
--
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table job_handovers add column if not exists ho_no text;

-- backfill ใบเก่า: HO-<วันที่สร้าง>-<เวลา>-<เศษ uuid> (กันซ้ำ)
update job_handovers
   set ho_no = 'HO-' || to_char(created_at, 'YYMMDD-HH24MISS') || '-' || substr(replace(id::text, '-', ''), 1, 3)
 where ho_no is null;

create unique index if not exists job_handovers_ho_no_key on job_handovers(ho_no) where ho_no is not null;

-- ✅ ตรวจผล
select 'handover ho_no ready' as status;
