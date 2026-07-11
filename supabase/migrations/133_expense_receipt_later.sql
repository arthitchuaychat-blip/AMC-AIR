-- 133_expense_receipt_later.sql — เบิกเงินก่อน แนบใบเสร็จทีหลัง
-- พนักงานขอเบิก (ยังไม่มีใบเสร็จ) → หัวหน้าอนุมัติ+โอน+แนบสลิป → พนักงานเอาเงินไปจ่าย
-- แล้วกลับมาแนบใบเสร็จเพิ่มในรายการเดิมได้เอง (RLS เดิมให้ออฟฟิศแก้ได้เท่านั้น
-- จึงเปิดทางผ่านฟังก์ชันนี้ — เติมรูปได้อย่างเดียว แก้ยอดเงิน/สถานะไม่ได้)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create or replace function expense_attach_receipt(p_id uuid, p_urls text[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_urls is null or array_length(p_urls, 1) is null then
    raise exception 'ไม่มีรูปที่จะแนบ';
  end if;
  update expense_requests
  set attachments = attachments || p_urls
  where id = p_id
    and (requester = auth.uid() or my_role() in ('admin','exec','finance','hr'));
  if not found then
    raise exception 'ไม่พบคำขอเบิก หรือไม่มีสิทธิ์แนบใบเสร็จรายการนี้';
  end if;
end $$;

grant execute on function expense_attach_receipt(uuid, text[]) to authenticated;

-- ✅ ตรวจผล: ต้องเห็นฟังก์ชัน 1 แถว
select proname from pg_proc where proname = 'expense_attach_receipt';
