-- ═══════════════════════════════════════════════════════════════════════════
-- 225 · แกนระบบบัญชีคู่ (Double-entry core) — ตารางใหม่ล้วน ไม่แตะของเดิม
-- ระบบบัญชีในแอป AMC · multi-entity: บริษัท (จด VAT) + บุคคล (ไม่จด VAT)
-- เริ่มใช้จริง 1 ม.ค. 2027 (รอบบัญชี ม.ค.–ธ.ค.) · ยกยอดจาก FlowAccount 31 ธ.ค. 2026
-- รันใน Supabase → SQL Editor ครั้งเดียว (โปรเจกต์ tpyrlxhoyghawqvsphfj)
-- ปลอดภัย: สร้างตารางใหม่ทั้งหมด โปรแกรมขาย/เอกสารเดิมไม่กระทบ
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) กิจการ (เชื่อมกับ company_profile เดิม: id=1 บริษัทมี VAT · id=2 บุคคลไม่มี VAT) ──
create table if not exists acc_entities (
  code        text primary key,          -- 'company' | 'personal'
  profile_id  int  not null,             -- อ้าง company_profile.id (1 หรือ 2)
  vat         boolean not null default false,
  name        text,
  sort        int default 0
);
insert into acc_entities (code, profile_id, vat, name, sort) values
  ('company',  1, true,  'บริษัท เอเอ็มซี มัลติ-บิซ จำกัด', 1),
  ('personal', 2, false, 'บุคคลธรรมดา อาทิตย์ ช่วยชาติ',    2)
on conflict (code) do nothing;

-- ── 2) ผังบัญชี (Chart of Accounts) ──
create table if not exists acc_accounts (
  code          text primary key,        -- '4010' ฯลฯ
  name          text not null,
  category      text not null,           -- asset | liability | equity | revenue | expense
  subtype       text,                    -- current/fixed/contra · cogs/selling/admin/finance/tax · operating/other ฯลฯ
  normal_side   text not null default 'debit',  -- debit | credit (ด้านปกติของบัญชี)
  entity_scope  text not null default 'shared', -- shared | company | personal (VAT = company เท่านั้น)
  active        boolean not null default true,
  sort          int default 0,
  note          text
);

insert into acc_accounts (code, name, category, subtype, normal_side, entity_scope, sort) values
  -- 1xxx สินทรัพย์
  ('1010','เงินสด',                                    'asset','current','debit','shared',101),
  ('1011','เงินสดย่อย',                                'asset','current','debit','shared',102),
  ('1020','เงินฝากธนาคาร – บริษัท',                    'asset','current','debit','company',103),
  ('1021','เงินฝากธนาคาร – บุคคล',                     'asset','current','debit','personal',104),
  ('1100','ลูกหนี้การค้า',                             'asset','current','debit','shared',110),
  ('1110','เงินทดรองจ่าย / ลูกหนี้อื่น',               'asset','current','debit','shared',111),
  ('1200','สินค้าคงเหลือ – เครื่องปรับอากาศ',          'asset','current','debit','shared',120),
  ('1210','สินค้าคงเหลือ – อะไหล่/วัสดุ',              'asset','current','debit','shared',121),
  ('1300','ภาษีซื้อ (VAT ซื้อ)',                       'asset','current','debit','company',130),
  ('1310','ภาษีเงินได้ถูกหัก ณ ที่จ่าย (รอเครดิต)',    'asset','current','debit','shared',131),
  ('1500','เครื่องมือ-อุปกรณ์ช่าง',                    'asset','fixed','debit','shared',150),
  ('1510','ยานพาหนะ',                                  'asset','fixed','debit','shared',151),
  ('1520','เครื่องใช้สำนักงาน',                        'asset','fixed','debit','shared',152),
  ('1590','ค่าเสื่อมราคาสะสม',                         'asset','contra','credit','shared',159),
  -- 2xxx หนี้สิน
  ('2010','เจ้าหนี้การค้า',                            'liability','current','credit','shared',201),
  ('2020','ค่าใช้จ่ายค้างจ่าย / เจ้าหนี้อื่น',         'liability','current','credit','shared',202),
  ('2100','ภาษีขาย (VAT ขาย)',                         'liability','current','credit','company',210),
  ('2110','ภาษีมูลค่าเพิ่มค้างชำระ (ภ.พ.30)',          'liability','current','credit','company',211),
  ('2120','ภาษีหัก ณ ที่จ่ายค้างนำส่ง (ภ.ง.ด.1/3/53)', 'liability','current','credit','shared',212),
  ('2130','ประกันสังคมค้างนำส่ง',                      'liability','current','credit','shared',213),
  ('2140','ภาษีเงินได้นิติบุคคลค้างจ่าย',              'liability','current','credit','company',214),
  ('2200','เงินเดือนค้างจ่าย',                         'liability','current','credit','shared',220),
  ('2300','เงินยืม / เงินกู้',                         'liability','longterm','credit','shared',230),
  -- 3xxx ส่วนของเจ้าของ
  ('3010','ทุนจดทะเบียน / ทุนเจ้าของ',                 'equity','capital','credit','shared',301),
  ('3020','กำไร(ขาดทุน)สะสม',                          'equity','retained','credit','shared',302),
  ('3030','เงินถอนใช้ส่วนตัว',                         'equity','drawings','debit','personal',303),
  -- 4xxx รายได้
  ('4010','รายได้ – ขายเครื่องปรับอากาศ',              'revenue','operating','credit','shared',401),
  ('4020','รายได้ – ค่าบริการติดตั้ง',                 'revenue','operating','credit','shared',402),
  ('4030','รายได้ – ค่าบริการล้าง',                    'revenue','operating','credit','shared',403),
  ('4040','รายได้ – ค่าบริการซ่อม',                    'revenue','operating','credit','shared',404),
  ('4050','รายได้ – ค่าบริการย้าย',                    'revenue','operating','credit','shared',405),
  ('4060','รายได้ – ค่าบริการอื่นๆ',                   'revenue','operating','credit','shared',406),
  ('4900','รายได้อื่น (ดอกเบี้ยรับ/เศษซาก)',           'revenue','other','credit','shared',490),
  -- 5xxx ต้นทุนขายและบริการ
  ('5010','ต้นทุนขายเครื่องปรับอากาศ',                 'expense','cogs','debit','shared',501),
  ('5020','ต้นทุนอะไหล่/วัสดุใช้ในงานบริการ',          'expense','cogs','debit','shared',502),
  ('5030','เงินเดือนช่างประจำ – ต้นทุนบริการ',         'expense','cogs','debit','shared',503),
  ('5040','ค่าแรงช่างซัพ (ผู้รับเหมาช่วง) – ต้นทุนบริการ','expense','cogs','debit','shared',504),
  ('5050','ค่าน้ำมัน/ค่าเดินทางหน้างาน – ต้นทุนบริการ','expense','cogs','debit','shared',505),
  ('5060','ค่าเสื่อมเครื่องมือ-ยานพาหนะ – ต้นทุนบริการ','expense','cogs','debit','shared',506),
  -- 6xxx ค่าใช้จ่ายในการขาย
  ('6010','เงินเดือนฝ่ายขาย/การตลาด',                  'expense','selling','debit','shared',601),
  ('6020','ค่าคอมมิชชั่นการขาย',                       'expense','selling','debit','shared',602),
  ('6030','ค่าโฆษณา/การตลาด/ออนไลน์',                  'expense','selling','debit','shared',603),
  -- 7xxx ค่าใช้จ่ายในการบริหาร
  ('7010','เงินเดือนผู้บริหาร/บัญชี/ธุรการ',           'expense','admin','debit','shared',701),
  ('7020','ค่าเช่าสำนักงาน/โกดัง',                     'expense','admin','debit','shared',702),
  ('7030','ค่าน้ำ-ไฟ-โทร-เน็ต (สำนักงาน)',             'expense','admin','debit','shared',703),
  ('7040','ค่าวัสดุสิ้นเปลืองสำนักงาน',                'expense','admin','debit','shared',704),
  ('7050','ค่าทำบัญชี/สอบบัญชี/ที่ปรึกษา',             'expense','admin','debit','shared',705),
  ('7060','ค่าเสื่อมราคา – สำนักงาน',                  'expense','admin','debit','shared',706),
  ('7070','ค่าธรรมเนียมธนาคาร',                        'expense','admin','debit','shared',707),
  ('7080','ประกันสังคม (ส่วนนายจ้าง)',                 'expense','admin','debit','shared',708),
  ('7090','ค่าใช้จ่ายเบ็ดเตล็ด',                       'expense','admin','debit','shared',709),
  -- 8xxx ต้นทุนการเงิน / ภาษี
  ('8010','ดอกเบี้ยจ่าย',                              'expense','finance','debit','shared',801),
  ('8100','ภาษีเงินได้นิติบุคคล',                      'expense','tax','debit','company',810)
on conflict (code) do nothing;

-- ── 3) สมุดรายวัน — หัวรายการ (Journal entry header) ──
create table if not exists acc_journal (
  id          bigint generated always as identity primary key,
  entity      text not null,             -- 'company' | 'personal'
  jdate       date not null,
  period      text,                      -- 'YYYY-MM' (ไว้กรอง/ล็อกงวด)
  ref_type    text,                      -- quotation|invoice|receipt|po|expense|payroll|opening|manual
  ref_no      text,                      -- เลขเอกสารต้นทาง
  memo        text,
  status      text not null default 'posted', -- draft|posted|void
  source      text not null default 'auto',   -- auto (จากเอกสาร) | manual (ลงเอง)
  created_by  uuid default auth.uid(),
  created_at  timestamptz default now(),
  constraint acc_journal_entity_ck check (entity in ('company','personal'))
);
create index if not exists acc_journal_entity_date_idx on acc_journal (entity, jdate);
create index if not exists acc_journal_period_idx      on acc_journal (period);
create index if not exists acc_journal_ref_idx         on acc_journal (ref_type, ref_no);

-- ── 4) สมุดรายวัน — บรรทัดเดบิต/เครดิต (Journal lines) ──
create table if not exists acc_journal_lines (
  id            bigint generated always as identity primary key,
  journal_id    bigint not null references acc_journal(id) on delete cascade,
  account_code  text   not null references acc_accounts(code),
  entity        text   not null,         -- denormalize จากหัว (ทำ ledger รายกิจการเร็ว)
  debit         numeric(14,2) not null default 0,
  credit        numeric(14,2) not null default 0,
  memo          text,
  line_no       int default 0,
  constraint acc_lines_nonneg_ck check (debit >= 0 and credit >= 0),
  constraint acc_lines_oneside_ck check (not (debit > 0 and credit > 0))
);
create index if not exists acc_lines_journal_idx on acc_journal_lines (journal_id);
create index if not exists acc_lines_account_idx on acc_journal_lines (account_code);
create index if not exists acc_lines_entity_idx  on acc_journal_lines (entity);

-- ── 5) ล็อกงวดบัญชี (กันแก้ย้อนหลังหลังปิดงบ) ──
create table if not exists acc_periods (
  entity     text not null,
  period     text not null,              -- 'YYYY-MM'
  status     text not null default 'open', -- open | closed
  closed_by  uuid,
  closed_at  timestamptz,
  primary key (entity, period)
);

-- ── RLS: อ่านได้ทุกคนที่ล็อกอิน · เขียน/แก้เฉพาะ admin/exec/finance (เหมือน company_profile) ──
do $$
declare t text;
begin
  foreach t in array array['acc_entities','acc_accounts','acc_journal','acc_journal_lines','acc_periods']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t||'_read', t);
    execute format('create policy %I on %I for select to authenticated using (true);', t||'_read', t);
    execute format('drop policy if exists %I on %I;', t||'_write', t);
    execute format($f$create policy %I on %I for all to authenticated
      using (my_role() in ('admin','exec','finance'))
      with check (my_role() in ('admin','exec','finance'));$f$, t||'_write', t);
  end loop;
end $$;
