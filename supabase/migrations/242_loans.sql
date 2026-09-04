-- 242: เมนูหนี้สิน — สินเชื่อ/เช่าซื้อ (รถ 6 คัน + สินเชื่อออฟฟิศ)
-- เก็บพารามิเตอร์สัญญา แล้วให้แอปคำนวณตารางผ่อน + เงินต้น/หนี้คงเหลือ + ประมาณการจ่ายล่วงหน้าเอง
-- (ไม่ต้องเก็บทุกงวด — reducing สร้างตารางเป๊ะจาก เงินต้นตั้งต้น + ดอกเบี้ย%/ปี + ค่างวด)
create table if not exists loans (
  id          bigserial primary key,
  name        text not null,
  kind        text not null default 'vehicle',   -- vehicle(รถ) | office(สินเชื่อออฟฟิศ) | other
  method      text not null default 'flat',       -- flat(เช่าซื้อ ดอกคงที่) | reducing(ลดต้นลดดอก) | stepped(ขั้นบันได)
  entity      text not null default 'company',    -- กิจการที่จ่าย: company(บริษัท) | personal(บุคคล)
  asset_tag   text,                               -- ผูกรายการย่อย (ทะเบียนรถ/สถานที่)
  lender      text,                               -- ไฟแนนซ์/ธนาคาร
  contract_no text,                               -- เลขสัญญา
  principal   numeric,                            -- เงินต้นตั้งต้น/ยอดจัด (opening)
  rate        numeric,                            -- ดอกเบี้ย %/ปี (ใช้กับ reducing)
  installment numeric not null default 0,         -- ค่างวด/เดือน (รวม VAT)
  vat_per     numeric not null default 0,         -- VAT ต่องวด (คงที่ ถ้ามี)
  term_months int not null default 0,             -- จำนวนงวดทั้งหมด
  start_date  date,                               -- วันครบกำหนดงวดที่ 1
  due_day     int not null default 5,             -- วันครบกำหนดชำระแต่ละเดือน
  paid_count  int not null default 0,             -- จ่ายไปแล้วกี่งวด (จ่ายจริงแล้ว)
  submitted_seq int not null default 0,            -- งวดที่ตั้งจ่ายแล้ว (รอจ่ายจริง) กันตั้งซ้ำ
  steps       jsonb not null default '[]'::jsonb,  -- ค่างวดขั้นบันได [{from,to,amount}] (method=stepped)
  balloon     numeric,                             -- งวดสุดท้ายจ่ายก้อนใหญ่ (balloon) ถ้ามี
  attachments jsonb not null default '[]'::jsonb,  -- ไฟล์สัญญา/เอกสาร [{url,name}]
  note        text,
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
alter table loans add column if not exists attachments jsonb not null default '[]'::jsonb;  -- เผื่อรัน create ไปก่อนมีคอลัมน์นี้
alter table loans add column if not exists steps jsonb not null default '[]'::jsonb;         -- ค่างวดขั้นบันได
alter table loans add column if not exists balloon numeric;                                  -- งวดบอลลูน
alter table loans add column if not exists entity text not null default 'company';           -- บริษัท/บุคคล
alter table loans add column if not exists submitted_seq int not null default 0;             -- งวดที่ตั้งจ่ายแล้ว
alter table loans enable row level security;
drop policy if exists loans_read on loans;
create policy loans_read on loans for select using (true);
drop policy if exists loans_write on loans;
create policy loans_write on loans for all
  using (my_role() in ('admin','exec','finance','hr'))
  with check (my_role() in ('admin','exec','finance','hr'));

-- อนุญาต source_type 'loan' ในกระแสเงินสด (ประมาณการค่างวดล่วงหน้า) — ไม่งั้น sync จะ insert ไม่ได้แบบเงียบ ๆ
alter table cash_entries drop constraint if exists cash_entries_source_type_check;
alter table cash_entries add constraint cash_entries_source_type_check
  check (source_type in ('manual','invoice','receipt','payout','po','opening','expense','salary','labor_owed','expense_paid','expense_due','advance','loan'));
