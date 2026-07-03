-- 090_trade_account.sql — เพิ่มบัญชีรับเงิน "Trade Baht" (ช่องทางชำระ Trade Account) เป็นบัญชีที่ 4
-- ใบเสร็จที่จ่ายผ่าน Trade จะถูกดึงเข้าบัญชีนี้แทนบัญชีธนาคาร VAT/ไม่ VAT · รันครั้งเดียว

insert into accounts (code, name, kind, sort) values
  ('trade', 'บัญชี Trade Baht', 'bank', 3)
on conflict (code) do nothing;

-- เรียงให้เงินสดย่อยอยู่ท้ายสุด (vat 1 · novat 2 · trade 3 · petty 4)
update accounts set sort = 4 where code = 'petty';
