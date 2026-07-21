-- 171: คืนสิทธิ์ "อ่าน" เนื้อหาเว็บที่ปิดอยู่ + คำสั่งซื้อจากเว็บ ให้ role graphic (รีวิว recheck)
--
-- ปัญหา 1 (เนื้อหาเว็บที่ซ่อน): graphic มีสิทธิ์เมนู "จัดการเว็บไซต์" (website: E) และ mig 082 ให้สิทธิ์ "เขียน"
--   แต่ policy "อ่าน" ของตารางรุ่นเก่า (072/078/079/080) ไม่มี graphic → อ่านได้เฉพาะแถว active = true
--   พอ graphic กด "ซ่อน" แถวนึง (active = false) แถวนั้นหายจากหน้าจัดการทันที ปุ่ม "แสดง" อยู่บนแถวที่หายไปแล้ว
--   → role นี้ซ่อนแล้วกู้กลับเองไม่ได้เลย · (web_services/web_reviews mig 131/134 ทำถูกอยู่แล้ว จึงไม่ต้องแตะ)
--
-- ปัญหา 2 (คำสั่งซื้อจากเว็บ): mig 082 เคยให้ graphic อ่าน web_orders (มีคอมเมนต์กำกับชัด)
--   แต่ mig 095 drop+create web_orders_read ใหม่โดยลืม graphic → เมนูโชว์ (weborders: V) แต่หน้าขึ้น "ยังไม่มีคำสั่งซื้อ"
--   (RLS ปฏิเสธ = คืน 0 แถว ไม่ error) · คืนสิทธิ์ "อ่านอย่างเดียว" ให้ตรงกับสิทธิ์เมนู V (ดูอย่างเดียว การจัดการยังเป็นของ sales/ธุรการ)

-- ---------- เนื้อหาเว็บที่ปิดอยู่: เพิ่ม graphic ในสิทธิ์อ่าน ----------
drop policy if exists wc_read on web_clients;
create policy wc_read on web_clients for select to anon, authenticated
  using (active = true or my_role() in ('admin','sales','exec','finance','graphic'));

drop policy if exists wb_read on web_banners;
create policy wb_read on web_banners for select to anon, authenticated
  using (active = true or my_role() in ('admin','sales','exec','finance','graphic'));

drop policy if exists wad_read on web_ads;
create policy wad_read on web_ads for select to anon, authenticated
  using (active = true or my_role() in ('admin','sales','exec','finance','graphic'));

-- web_portfolio / web_articles / web_press ใช้ policy ชื่อ wcnt_read เหมือนกัน (mig 079 สร้างในลูป)
do $$
declare t text;
begin
  foreach t in array array['web_portfolio','web_articles','web_press'] loop
    execute format('drop policy if exists wcnt_read on %I', t);
    execute format($p$create policy wcnt_read on %I for select to anon, authenticated
      using (active = true or my_role() in ('admin','sales','exec','finance','graphic'))$p$, t);
  end loop;
end $$;

-- ---------- คำสั่งซื้อจากเว็บ: คืนสิทธิ์อ่านให้ graphic (ดูอย่างเดียว) ----------
drop policy if exists web_orders_read on web_orders;
create policy web_orders_read on web_orders for select to authenticated
  using (my_role() in ('admin','sales','exec','finance','hr','graphic'));

-- ✅ ตรวจผล: ต้องเห็น graphic ในคอลัมน์ qual ของทุก policy ด้านล่าง
-- select tablename, policyname, qual from pg_policies
-- where schemaname='public' and policyname in ('wc_read','wb_read','wad_read','wcnt_read','web_orders_read')
-- order by tablename, policyname;
