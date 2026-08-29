-- 233: แยกกระแสเงินสดตามกิจการ (บริษัท จด VAT / บุคคล ไม่จด) + เงินสดยกมาแยกกิจการ
-- entity ของแต่ละเส้น: รายได้ (ใบเสร็จ/ใบแจ้งหนี้) แยกตาม VAT · ต้นทุน/เงินเดือน/ช่างซัพ = บริษัท
alter table cash_entries add column if not exists entity text not null default 'company';
comment on column cash_entries.entity is 'กิจการเจ้าของกระแสเงินสดเส้นนี้: company (บริษัท จด VAT · ธนาคาร 1020) | personal (บุคคล · ธนาคาร 1021)';

-- เดิม: เงินสดยกมา (opening) มีได้แถวเดียวทั้งระบบ → เปลี่ยนเป็น 1 แถวต่อกิจการ
drop index if exists cash_entries_opening_one;
create unique index if not exists cash_entries_opening_one
  on cash_entries (source_type, entity) where source_type = 'opening';
