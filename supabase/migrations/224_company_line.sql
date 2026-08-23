-- ช่องทาง LINE ของบริษัท (แสดงในหัวจดหมายอีเมล + เอกสาร)
alter table company_profile add column if not exists line_id text;
comment on column company_profile.line_id is 'LINE ID หรือลิงก์ LINE OA ของบริษัท (แสดงในอีเมล/เอกสาร)';
