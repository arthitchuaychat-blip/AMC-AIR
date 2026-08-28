-- 229 · โปรโมชั่น: เพิ่มประเภทส่วนลด (บาท / %) — ต่อยอด 228 · รันครั้งเดียว
alter table promo_campaigns add column if not exists discount_type text not null default 'amount';  -- amount | percent
comment on column promo_campaigns.discount_type is 'amount = ส่วนลดเป็นบาท · percent = ส่วนลดเป็น %';
comment on column promo_campaigns.note is 'เงื่อนไขโปรโมชั่น (แสดงบนคูปอง/เว็บ)';
