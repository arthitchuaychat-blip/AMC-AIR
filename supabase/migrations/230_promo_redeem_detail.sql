-- 230 · คูปอง: เก็บรายละเอียดการใช้ (พื้นที่ + วันนัดหมาย) — ต่อยอด 228/229 · รันครั้งเดียว
-- ใคร=name/phone · โปร=campaign_id · ที่ไหน=area · ใช้เมื่อ=redeemed_at · นัด=appoint_at · เลขงาน=redeemed_ref · ลูกค้า=customer_id
alter table promo_coupons add column if not exists area      text;
alter table promo_coupons add column if not exists appoint_at date;
