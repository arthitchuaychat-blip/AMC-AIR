-- 084_receipt_flowaccount_rpc.sql — ให้ฝ่ายขาย + HR ประทับเลข FlowAccount บนใบเสร็จได้
-- (ส่งใบกำกับภาษีเข้า FlowAccount แล้วบันทึกเลขกลับมาที่ใบเสร็จ) โดยไม่ต้องเปิดสิทธิ์เขียนทั้งตาราง
-- รันใน Supabase → SQL Editor (ครั้งเดียว)
-- หมายเหตุ: allowlist ต้องตรงกับ api/flowaccount-doc.js และ Receipts.jsx (admin/exec/finance/sales/hr)

create or replace function set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('admin','exec','finance','sales','hr') then raise exception 'forbidden'; end if;
  update receipts
     set flowaccount_id = nullif(p_fa_id, ''),
         flowaccount_no = nullif(p_fa_no, ''),
         flowaccount_at = now()
   where receipt_no = p_receipt_no;
end; $$;

grant execute on function set_receipt_flowaccount(text, text, text) to authenticated;
