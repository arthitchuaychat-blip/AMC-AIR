-- 157: บันทึกรายการในเอกสารแบบ "ธุรกรรมเดียวจบ" (แก้ปัญหาเน็ตหลุดกลางทางแล้วรายการหายถาวร)
--
-- ปัญหาเดิม: saveBoq / saveQuotation ทำ 2 คำสั่งแยกกัน
--   1) delete รายการเดิมทั้งหมด   2) insert รายการใหม่
-- ถ้าเน็ตหลุด/แท็บถูกปิด/แบตหมด ระหว่างข้อ 1 กับ 2 → เอกสารเหลือ "หัวใบเปล่า ๆ" ไม่มีรายการเลย กู้ไม่ได้
-- (ตรงกับอาการ 'ใบดูว่างทั้งที่เคยมีของ' ที่เคยเจอ)
--
-- วิธีแก้: ย้ายทั้ง 2 คำสั่งเข้าไปอยู่ใน function เดียว — Postgres รันทั้ง function ในทรานแซกชันเดียว
-- ล้มกลางทาง = rollback อัตโนมัติ รายการเดิมยังอยู่ครบ
-- security invoker = ยังเช็ค RLS ตามสิทธิ์ผู้ใช้เหมือนเดิม (ไม่ได้เปิดช่องให้ใครเขียนข้ามสิทธิ์)

create or replace function replace_boq_items(p_boq_no text, p_items jsonb)
returns void language plpgsql security invoker as $$
begin
  delete from boq_items where boq_no = p_boq_no;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    insert into boq_items (boq_no, section, item_code, name, description, unit, qty, unit_cost)
    select p_boq_no, x->>'section', nullif(x->>'item_code', ''), nullif(x->>'name', ''),
           nullif(x->>'description', ''), nullif(x->>'unit', ''),
           coalesce((x->>'qty')::numeric, 0), coalesce((x->>'unit_cost')::numeric, 0)
    from jsonb_array_elements(p_items) x;
  end if;
end $$;

create or replace function replace_quotation_items(p_quote_no text, p_items jsonb)
returns void language plpgsql security invoker as $$
begin
  delete from quotation_items where quote_no = p_quote_no;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    insert into quotation_items (quote_no, item_code, name, kind, description, unit, qty, unit_price, discount)
    select p_quote_no, nullif(x->>'item_code', ''), nullif(x->>'name', ''), nullif(x->>'kind', ''),
           nullif(x->>'description', ''), nullif(x->>'unit', ''),
           coalesce((x->>'qty')::numeric, 0), coalesce((x->>'unit_price')::numeric, 0),
           coalesce((x->>'discount')::numeric, 0)
    from jsonb_array_elements(p_items) x;
  end if;
end $$;

grant execute on function replace_boq_items(text, jsonb) to authenticated;
grant execute on function replace_quotation_items(text, jsonb) to authenticated;

-- ✅ ตรวจผล: บันทึก BOQ/ใบเสนอราคา 1 ใบแล้วรายการต้องครบเหมือนเดิม
-- select routine_name from information_schema.routines where routine_name like 'replace_%_items';
