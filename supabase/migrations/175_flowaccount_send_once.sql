-- 175: ส่งใบกำกับเข้า FlowAccount ได้ครั้งเดียว กันส่งซ้ำที่ระดับฐานข้อมูล (claim-before-send)
--
-- โจทย์เจ้าของ: "ส่งรายการแล้วต้องส่งไปอีกไม่ได้ กันส่งซ้ำ"
-- ของเดิม: ปุ่มยังกดส่งซ้ำได้ (แค่เตือน) · RPC set_receipt_flowaccount เขียนทับเลขเดิมได้ ·
--   และถ้า FA สร้างสำเร็จแต่บันทึกเลขกลับพลาด (client กลืน error) เลขจะว่าง กดใหม่ = ซ้ำ
--
-- แนวคิด: "จองใบก่อนยิง" (แบบเดียวกับ markPoReceived) — ยิงเข้า FlowAccount ได้ก็ต่อเมื่อจองสำเร็จ
--   จองได้เมื่อ: ยังไม่เคยส่ง (flowaccount_id is null) และยังไม่มีใครจอง (flowaccount_at is null)
--
-- ⚠️ ไม่มี auto-reopen ตามเวลา (เดิมเคยให้ปลดล็อกเองถ้าค้างเกิน 10 นาที — ผิด!):
--   "ยังไม่เคยยิง" (ปลอดภัยส่งใหม่) กับ "ยิงเข้า FA แล้วแต่ประทับเลขกลับพลาด" (ห้ามส่งซ้ำ)
--   มีสถานะ DB เหมือนกันเป๊ะ (flowaccount_id null + flowaccount_at ตั้งไว้) แยกด้วยเวลาไม่ได้
--   ⇒ ค้างจอง = บล็อกไว้จนคนมาจัดการเอง (ในแอป: เช็ก FlowAccount แล้วเลือก "บันทึกเลข" หรือ "ปลดล็อกส่งใหม่")

-- ---------- (1) จองใบก่อนส่ง ----------
create or replace function claim_receipt_flowaccount(p_receipt_no text)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed int;
begin
  if my_role() not in ('admin','exec','finance','sales','hr') then raise exception 'forbidden'; end if;
  update receipts set flowaccount_at = now()
   where receipt_no = p_receipt_no
     and flowaccount_id is null
     and flowaccount_at is null;   -- ไม่มี auto-reopen: ค้างจองต้องให้คนปลดล็อกเอง (กันส่งซ้ำเคส stamp พลาด)
  get diagnostics claimed = row_count;
  return claimed > 0;
end; $$;

-- ---------- (2) ประทับเลข FlowAccount — เขียนครั้งเดียว ห้ามทับของเดิม ----------
-- เปลี่ยน return void → boolean จึงต้อง drop ก่อน (create or replace เปลี่ยน return type ไม่ได้)
drop function if exists set_receipt_flowaccount(text, text, text);
create function set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text)
returns boolean language plpgsql security definer set search_path = public as $$
declare done int;
begin
  if my_role() not in ('admin','exec','finance','sales','hr') then raise exception 'forbidden'; end if;
  update receipts
     set flowaccount_id = nullif(p_fa_id, ''),
         flowaccount_no = nullif(p_fa_no, ''),
         flowaccount_at = now()
   where receipt_no = p_receipt_no
     and flowaccount_id is null;   -- เขียนครั้งเดียว: มีเลขแล้วห้ามทับ (กันส่งซ้ำเขียนทับเลขจริง)
  get diagnostics done = row_count;
  return done > 0;
end; $$;

-- ---------- (3) ปล่อยการจอง เมื่อส่งไม่สำเร็จ (ยังไม่ได้เลขจริง) เพื่อให้แก้แล้วส่งใหม่ได้ ----------
create or replace function release_receipt_flowaccount(p_receipt_no text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('admin','exec','finance','sales','hr') then raise exception 'forbidden'; end if;
  update receipts set flowaccount_at = null
   where receipt_no = p_receipt_no and flowaccount_id is null;   -- ปล่อยเฉพาะใบที่ยังไม่มีเลขจริง
end; $$;

grant execute on function claim_receipt_flowaccount(text) to authenticated;
grant execute on function set_receipt_flowaccount(text, text, text) to authenticated;
grant execute on function release_receipt_flowaccount(text) to authenticated;

-- ✅ ตรวจผล: ประทับเลขซ้ำใบเดิมต้องได้ false (ไม่ทับ)
-- select set_receipt_flowaccount('RC-xxxxxx', 'test', 'TEST-1');  -- true ครั้งแรก, false ครั้งถัดไป
