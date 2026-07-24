-- 173: แก้บั๊ก "แก้ใบเสนอราคาแล้วรายการซ้ำเพิ่มขึ้นเรื่อย ๆ ทุกครั้งที่บันทึก"
--
-- ต้นเหตุ (2 อย่างชนกัน):
--   1) mig 156 แตก policy "for all" ออกเป็น select/insert/update/delete แล้วตั้ง delete = admin เท่านั้น
--      ตามกติกา "ลบถาวร = ธุรการเท่านั้น" — แต่ไปใช้กับ "ตารางลูก" (boq_items / quotation_items) ด้วย
--   2) mig 157 ทำ replace_*_items เป็น security invoker (RLS มีผล) ซึ่ง "ลบเดิมทั้งหมด → เขียนใหม่"
--
--   ⇒ คนที่ไม่ใช่ admin (ฝ่ายขาย/บัญชี/ผู้บริหาร/HR) กดบันทึกใบเสนอราคา:
--        delete → RLS กรองทิ้งเงียบ ๆ ลบได้ 0 แถว (ไม่ error)
--        insert → ผ่าน เพิ่มรายการชุดใหม่ทับของเดิม
--     = รายการซ้ำ และทวีคูณทุกครั้งที่กดบันทึก · ยอดรวมในใบก็เพี้ยนตาม
--
-- แนวคิดที่ถูก: "ลบรายการในเอกสารระหว่างแก้ไข" = การแก้เอกสาร ไม่ใช่ "ลบเอกสารถาวร"
--   ตารางลูกจึงให้สิทธิ์ลบเท่ากับสิทธิ์แก้ · ส่วนหัวเอกสาร (boqs/quotations/invoices/receipts/billing_notes)
--   ยังคง "ลบถาวร = admin เท่านั้น" ตามกติกาบ้าน ไม่แตะ

-- ---------- (1) ตารางลูก: สิทธิ์ลบ = สิทธิ์แก้ ----------
drop policy if exists boqi_write_del on boq_items;
create policy boqi_write_del on boq_items for delete to authenticated
  using (my_role() in ('admin','sales','exec','finance','hr'));

drop policy if exists qti_write_del on quotation_items;
create policy qti_write_del on quotation_items for delete to authenticated
  using (my_role() in ('admin','sales','exec','finance','hr'));

-- ---------- (2) กันไม่ให้ "ลบไม่ติดแล้วเพิ่มซ้ำ" เกิดเงียบ ๆ ได้อีก ----------
-- ถ้าลบแล้วยังมีแถวเดิมเหลืออยู่ = สิทธิ์ไม่พอ → ยกเลิกทั้งธุรกรรม ดีกว่าปล่อยให้รายการซ้ำ
create or replace function replace_boq_items(p_boq_no text, p_items jsonb)
returns void language plpgsql security invoker as $fn$
begin
  delete from boq_items where boq_no = p_boq_no;
  if exists (select 1 from boq_items where boq_no = p_boq_no) then
    raise exception 'ลบรายการเดิมของ % ไม่สำเร็จ (สิทธิ์ไม่พอ) — ยกเลิกการบันทึกเพื่อกันรายการซ้ำ', p_boq_no;
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    insert into boq_items (boq_no, section, item_code, name, description, unit, qty, unit_cost)
    select p_boq_no, x->>'section', nullif(x->>'item_code', ''), nullif(x->>'name', ''),
           nullif(x->>'description', ''), nullif(x->>'unit', ''),
           coalesce((x->>'qty')::numeric, 0), coalesce((x->>'unit_cost')::numeric, 0)
    from jsonb_array_elements(p_items) x;
  end if;
end $fn$;

create or replace function replace_quotation_items(p_quote_no text, p_items jsonb)
returns void language plpgsql security invoker as $fn$
begin
  delete from quotation_items where quote_no = p_quote_no;
  if exists (select 1 from quotation_items where quote_no = p_quote_no) then
    raise exception 'ลบรายการเดิมของ % ไม่สำเร็จ (สิทธิ์ไม่พอ) — ยกเลิกการบันทึกเพื่อกันรายการซ้ำ', p_quote_no;
  end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 0 then
    insert into quotation_items (quote_no, item_code, name, kind, description, unit, qty, unit_price, discount)
    select p_quote_no, nullif(x->>'item_code', ''), nullif(x->>'name', ''), nullif(x->>'kind', ''),
           nullif(x->>'description', ''), nullif(x->>'unit', ''),
           coalesce((x->>'qty')::numeric, 0), coalesce((x->>'unit_price')::numeric, 0),
           coalesce((x->>'discount')::numeric, 0)
    from jsonb_array_elements(p_items) x;
  end if;
end $fn$;

grant execute on function replace_boq_items(text, jsonb) to authenticated;
grant execute on function replace_quotation_items(text, jsonb) to authenticated;

-- ---------- (3) ล้างรายการซ้ำที่เกิดไปแล้ว ----------
-- เก็บแถวแรกของแต่ละ "เอกสาร + รหัส/ชื่อ + หน่วย + จำนวน + ราคา" ที่เหมือนกันทุกอย่าง แล้วลบตัวซ้ำที่เหลือ
-- (ตัดสินจากเนื้อหาที่เหมือนกันเป๊ะ — บรรทัดที่ตั้งใจใส่ซ้ำแต่แก้จำนวน/ราคาต่างกัน จะไม่ถูกลบ)
-- ⚠️ ตรวจดูก่อนด้วย query ท้ายไฟล์ ถ้าเลขเยอะผิดปกติให้หยุดถามก่อนลบ
with d as (
  select id, row_number() over (
           partition by quote_no, coalesce(item_code, ''), coalesce(name, ''), coalesce(unit, ''),
                        qty, unit_price, coalesce(discount, 0), coalesce(description, ''), coalesce(kind, '')
           order by id) as rn
    from quotation_items
)
delete from quotation_items q using d where q.id = d.id and d.rn > 1;

with d as (
  select id, row_number() over (
           partition by boq_no, section, coalesce(item_code, ''), coalesce(name, ''), coalesce(unit, ''),
                        qty, unit_cost, coalesce(description, '')
           order by id) as rn
    from boq_items
)
delete from boq_items b using d where b.id = d.id and d.rn > 1;

-- ✅ ตรวจผล 1: สิทธิ์ลบของตารางลูกต้องเป็นรายชื่อ role (ไม่ใช่ my_role() = 'admin')
-- select tablename, policyname, cmd, qual from pg_policies
-- where tablename in ('boq_items','quotation_items') and cmd = 'DELETE';
--
-- ✅ ตรวจผล 2: ต้องไม่เหลือรายการซ้ำแบบเหมือนกันเป๊ะแล้ว (ควรได้ 0 แถว)
-- select quote_no, item_code, name, qty, unit_price, count(*)
--   from quotation_items group by 1,2,3,4,5 having count(*) > 1 order by count(*) desc;
