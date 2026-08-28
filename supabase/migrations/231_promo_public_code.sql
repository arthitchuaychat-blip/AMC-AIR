-- 231 · โปรโมชั่น: 1 โปร = 1 "โค้ดโปรโมชั่น" (public_code) ที่เรากำหนดเอง
-- ลูกค้าพิมพ์/ส่งรูปโค้ดนี้ → ระบบรู้ว่าเป็นโปรไหน → เจนรหัสส่วนลดเฉพาะลูกค้า (promo_coupons.code เดิม)
-- รันใน Supabase → SQL Editor ครั้งเดียว
alter table promo_campaigns add column if not exists public_code text;
comment on column promo_campaigns.public_code is 'โค้ดโปรโมชั่นเดียวต่อโปร (พิมพ์บนคูปอง/ให้ลูกค้าพิมพ์) — ต่างจาก promo_coupons.code ที่เป็นรหัสส่วนลดรายคน';
create unique index if not exists promo_campaigns_public_code_uq on promo_campaigns (upper(public_code)) where public_code is not null;
