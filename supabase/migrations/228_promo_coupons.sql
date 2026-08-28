-- ═══════════════════════════════════════════════════════════════════════════
-- 228 · ระบบคูปอง/โปรโมชั่น (lead magnet) — คูปองล้างแอร์ ฿750 × 100 รางวัล
-- รับผ่านเว็บฟอร์ม + แชต LINE/FB · โค้ดเฉพาะราย 100 โค้ดไม่ซ้ำ · เก็บ ชื่อ+เบอร์ + ช่องทาง
-- รันใน Supabase → SQL Editor ครั้งเดียว (โปรเจกต์ tpyrlxhoyghawqvsphfj) · ตารางใหม่ล้วน
-- ═══════════════════════════════════════════════════════════════════════════

-- ── แคมเปญ (นิยามโปร · ต่อยอดแคมเปญอื่นได้) ──
create table if not exists promo_campaigns (
  id           text primary key,              -- 'clean750'
  name         text not null,                 -- 'คูปองล้างแอร์ ฿750'
  value        numeric not null default 0,    -- 750
  quota        int not null default 0,        -- 100 (0 = ไม่จำกัด)
  valid_from   date,                          -- เริ่มแจก
  claim_until  date,                          -- รับคูปองภายใน
  use_by       date,                          -- ใช้คูปองภายใน
  active       boolean not null default true,
  note         text,
  created_at   timestamptz default now()
);
insert into promo_campaigns (id, name, value, quota, note) values
  ('clean750', 'คูปองล้างแอร์ ฿750', 750, 100, 'แจกคูปองล้างแอร์ 100 รางวัล')
on conflict (id) do nothing;

-- ── คูปองรายใบ (1 แถว = 1 ลูกค้าที่รับโค้ด) ──
create table if not exists promo_coupons (
  code          text primary key,             -- โค้ดไม่ซ้ำ เช่น 'CLN750-7XK9'
  campaign_id   text not null references promo_campaigns(id),
  status        text not null default 'claimed',  -- claimed | redeemed | expired | void
  name          text,
  phone         text,
  source        text,                         -- web | line | fb | manual
  line_user_id  text,
  fb_id         text,
  consent       boolean not null default false,   -- ยินยอม PDPA
  customer_id   bigint references customers(id) on delete set null,  -- จับคู่ลูกค้าเดิม (ถ้ามี)
  claimed_at    timestamptz default now(),
  redeemed_at   timestamptz,
  redeemed_ref  text,                         -- เลขใบเสนอ/ใบงานที่ใช้คูปอง
  redeemed_by   uuid,
  note          text
);
create index if not exists promo_coupons_campaign_idx on promo_coupons (campaign_id, status);
create index if not exists promo_coupons_phone_idx     on promo_coupons (phone);
-- กันแจกซ้ำ: 1 เบอร์ / 1 LINE / 1 FB = 1 สิทธิ์ต่อแคมเปญ
create unique index if not exists promo_coupons_uq_phone on promo_coupons (campaign_id, phone) where phone is not null;
create unique index if not exists promo_coupons_uq_line  on promo_coupons (campaign_id, line_user_id) where line_user_id is not null;
create unique index if not exists promo_coupons_uq_fb    on promo_coupons (campaign_id, fb_id) where fb_id is not null;

-- ── RLS ──
-- แคมเปญ: อ่านทุกคนที่ล็อกอิน · แก้ admin/exec
alter table promo_campaigns enable row level security;
drop policy if exists promo_camp_read on promo_campaigns;
create policy promo_camp_read on promo_campaigns for select to authenticated using (true);
drop policy if exists promo_camp_write on promo_campaigns;
create policy promo_camp_write on promo_campaigns for all to authenticated
  using (my_role() in ('admin','exec')) with check (my_role() in ('admin','exec'));

-- คูปอง: อ่าน/ใช้ (redeem) โดยทีมหลังบ้าน · การ "รับคูปอง" จากลูกค้าทำผ่าน API (service role) ข้าม RLS
alter table promo_coupons enable row level security;
drop policy if exists promo_coup_read on promo_coupons;
create policy promo_coup_read on promo_coupons for select to authenticated
  using (my_role() in ('admin','exec','finance','sales','field_sales','stock','hr'));
drop policy if exists promo_coup_write on promo_coupons;
create policy promo_coup_write on promo_coupons for all to authenticated
  using (my_role() in ('admin','exec','sales','field_sales'))
  with check (my_role() in ('admin','exec','sales','field_sales'));
