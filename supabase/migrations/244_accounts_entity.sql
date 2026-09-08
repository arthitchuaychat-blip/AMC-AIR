-- 244: ช่องทางรับ-จ่ายเงิน (บัญชี/บัตร/Barter) แยกบริษัท/บุคคล + เพิ่มเองได้
-- (แอปทำงานได้โดยไม่ต้องรันทันที — saveAccount มี fallback ตัดคอลัมน์ใหม่ออก)
alter table accounts add column if not exists entity     text not null default 'company';   -- company | personal
alter table accounts add column if not exists account_no text;                              -- เลขบัญชี/เลขบัตร (4 ตัวท้าย)

update accounts set entity = 'company' where entity is null or entity = '';
-- บัญชี VAT เดิม = ธ.กสิกรไทย (ตามที่เจ้าของแจ้ง) — ตั้งชื่อ/เลขให้ชัด (โค้ด 'vat' คงเดิม ระบบกระทบใบเสร็จยังทำงาน)
update accounts set name = 'ธ.กสิกรไทย (VAT) 1303863555', account_no = '1303863555' where code = 'vat' and account_no is null;

-- ช่องทางที่เจ้าของแจ้ง (โค้ด 'trade' = Barter Trade Baht เชื่อมกับ syncBankReceipts)
insert into accounts (code, name, kind, entity, account_no, sort, active) values
  ('scb',      'ธ.ไทยพาณิชย์ 2644541054',    'bank',   'company',  '2644541054', 10, true),
  ('ktb',      'ธ.กรุงไทย 0460702289',        'bank',   'company',  '0460702289', 11, true),
  ('ttb',      'ธ.ทหารไทยธนชาต 2097168609',   'bank',   'company',  '2097168609', 12, true),
  ('trade',    'Barter บัญชี Trade Baht',     'barter', 'company',  null,         13, true),
  ('cc_k4824', 'บัตรเครดิตกสิกร-4824',         'card',   'company',  '4824',       14, true),
  ('cc_k9796', 'บัตรเครดิตกสิกร-9796',         'card',   'personal', '9796',       20, true)
on conflict (code) do nothing;
