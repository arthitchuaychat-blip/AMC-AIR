-- 156: อุด 3 ช่องโหว่สิทธิ์จากรีวิว (ข้อ 14-16 กลุ่ม "สูง")
--
-- (1) คลังรูป: policy อ่านไม่มี `to authenticated` → คนนอกเปิด/ไล่รายชื่อไฟล์ได้ (รูปเช็คอินพนักงาน ใบเสร็จ สลิปโอน)
--     และ policy ลบ/แก้ ไม่เช็ค role เลย → พนักงานคนไหนก็ลบไฟล์ของคนอื่นได้
-- (2) แชตเฟซบุ๊ก: fb_contacts/fb_messages เปิด `using (true)` แบบไม่ระบุ to → ครอบ anon = คนนอกอ่านแชตลูกค้าได้
-- (3) กติกาเหล็ก "ลบถาวร = ธุรการเท่านั้น" บังคับแค่ปุ่มบนจอ — RLS ยังเปิด for all ให้ 5 ตำแหน่งลบผ่าน API ได้

-- ============ (1) คลังรูป ============
-- อ่าน: ต้องล็อกอิน · เว็บสาธารณะใช้บักเก็ตนี้แสดงรูปสินค้าด้วย จึงคงสิทธิ์อ่านของ anon ไว้เฉพาะโฟลเดอร์ materials/ กับ brochures/
drop policy if exists "photos_read" on storage.objects;
create policy "photos_read" on storage.objects for select
  using (
    bucket_id = 'photos' and (
      auth.role() = 'authenticated'
      or name like 'materials/%'    -- รูปสินค้าที่หน้าเว็บ www.amcair.net ต้องแสดง
      or name like 'brochures/%'    -- โบรชัวร์รุ่นแอร์ (เปิดสาธารณะอยู่แล้วโดยเจตนา)
    )
  );

-- ลบ/เขียนทับ: เฉพาะฝ่ายออฟฟิศ (เดิมพนักงานทุกคนลบไฟล์ของใครก็ได้)
drop policy if exists "photos_update" on storage.objects;
create policy "photos_update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and my_role() in ('admin', 'exec', 'finance', 'sales', 'stock', 'hr', 'graphic'))
  with check (bucket_id = 'photos');
drop policy if exists "photos_delete" on storage.objects;
create policy "photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and my_role() in ('admin', 'exec', 'finance', 'sales', 'stock', 'hr', 'graphic'));

-- ============ (2) แชตเฟซบุ๊ก — ให้ตรงกับฝั่ง LINE ============
drop policy if exists fb_contacts_read on fb_contacts;
create policy fb_contacts_read on fb_contacts for select to authenticated
  using (my_role() in ('admin', 'sales', 'exec', 'finance', 'lead_tech', 'hr'));
drop policy if exists fb_messages_read on fb_messages;
create policy fb_messages_read on fb_messages for select to authenticated
  using (my_role() in ('admin', 'sales', 'exec', 'finance', 'lead_tech', 'hr'));

-- ============ (3) ลบเอกสารถาวร = ธุรการเท่านั้น (บังคับที่ฐานข้อมูล) ============
-- แตก policy "for all" เดิมออกเป็น select/insert/update (คนทำงานเหมือนเดิม) + delete (เฉพาะ admin)
do $$
declare
  t record;
  w text := $w$my_role() in ('admin','sales','exec','finance','hr')$w$;
begin
  for t in select unnest(array[
      'boqs:boq_write', 'boq_items:boqi_write', 'quotations:qt_write', 'quotation_items:qti_write',
      'invoices:inv_write', 'receipts:rc_write', 'billing_notes:bn_write'
    ]) as x
  loop
    declare
      tbl text := split_part(t.x, ':', 1);
      pol text := split_part(t.x, ':', 2);
    begin
      execute format('drop policy if exists %I on %I', pol, tbl);
      execute format('drop policy if exists %I on %I', pol || '_sel', tbl);
      execute format('drop policy if exists %I on %I', pol || '_ins', tbl);
      execute format('drop policy if exists %I on %I', pol || '_upd', tbl);
      execute format('drop policy if exists %I on %I', pol || '_del', tbl);
      execute format('create policy %I on %I for select to authenticated using (true)', pol || '_sel', tbl);
      execute format('create policy %I on %I for insert to authenticated with check (%s)', pol || '_ins', tbl, w);
      execute format('create policy %I on %I for update to authenticated using (%s) with check (%s)', pol || '_upd', tbl, w, w);
      -- กติกาเจ้าของ: ลบถาวรได้เฉพาะธุรการ (admin)
      execute format('create policy %I on %I for delete to authenticated using (my_role() = ''admin'')', pol || '_del', tbl);
    end;
  end loop;
end $$;

-- ✅ ตรวจผล: ต้องเห็น policy _del ของทุกตารางเป็น my_role() = 'admin'
-- select tablename, policyname, cmd, qual from pg_policies
-- where tablename in ('boqs','boq_items','quotations','quotation_items','invoices','receipts','billing_notes')
--   and policyname like '%_del' order by tablename;
