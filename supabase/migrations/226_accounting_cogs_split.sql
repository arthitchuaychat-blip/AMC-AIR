-- ═══════════════════════════════════════════════════════════════════════════
-- 226 · แยกบัญชีต้นทุน/สินค้าคงเหลือตามชนิด: เครื่องปรับอากาศ / วัสดุ / อุปกรณ์เสริม / อะไหล่
-- รันใน Supabase → SQL Editor (ครั้งเดียว) · ต่อยอดจาก 225 · ตารางเดิม ไม่กระทบข้อมูล
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ต้นทุนขายและบริการ (COGS) แยกชนิด ──
update acc_accounts set name = 'ต้นทุนขายเครื่องปรับอากาศ' where code = '5010';
insert into acc_accounts (code, name, category, subtype, normal_side, entity_scope, sort) values
  ('5011','ต้นทุนวัสดุ',          'expense','cogs','debit','shared',502),
  ('5012','ต้นทุนอุปกรณ์เสริม',    'expense','cogs','debit','shared',503),
  ('5013','ต้นทุนอะไหล่',          'expense','cogs','debit','shared',504)
on conflict (code) do nothing;
-- ขยับบัญชีต้นทุนอื่นให้เรียงต่อ + เปลี่ยน 5020 เป็น "ต้นทุนงานบริการ-อื่นๆ" (fallback)
update acc_accounts set name = 'ต้นทุนงานบริการ-อื่นๆ', sort = 505 where code = '5020';
update acc_accounts set sort = 506 where code = '5030';
update acc_accounts set sort = 507 where code = '5040';
update acc_accounts set sort = 508 where code = '5050';
update acc_accounts set sort = 509 where code = '5060';

-- ── สินค้าคงเหลือแยกชนิด (ไว้ตัดสต๊อกปลายงวด) ──
update acc_accounts set name = 'สินค้าคงเหลือ – วัสดุ' where code = '1210';
insert into acc_accounts (code, name, category, subtype, normal_side, entity_scope, sort) values
  ('1211','สินค้าคงเหลือ – อุปกรณ์เสริม','asset','current','debit','shared',122),
  ('1212','สินค้าคงเหลือ – อะไหล่',      'asset','current','debit','shared',123)
on conflict (code) do nothing;
