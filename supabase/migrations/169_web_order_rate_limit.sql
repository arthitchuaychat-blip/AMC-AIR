-- 169: กันสแปมคำสั่งซื้อจากเว็บ (รีวิว "ต่ำ" ข้อ 10)
--
-- ปัญหา: mig 071 เปิด insert ให้ anon ด้วย policy `with check (true)` — ใครถือ anon key
-- (ซึ่งอยู่ในไฟล์เว็บตามปกติของเว็บ static ทุกเว็บ) ยิงคำสั่งซื้อปลอมเข้ามากี่ใบก็ได้ ไม่จำกัด
-- ทุกใบ trigger notify_web_order() เด้งกระดิ่งให้ทุกคนที่ role admin/sales/exec
-- → กระดิ่งในแอปกับกล่อง "คำสั่งซื้อจากเว็บ" จมสแปม จนของจริงหาไม่เจอ
--
-- ⚠️ ที่ตรวจแล้วว่า "ไม่" เกิด: ฐานข้อมูลไม่ได้ยิง Web Push (ไม่มี pg_net/net.http_post ใน migration ไหนเลย)
--    push ยิงจากฝั่งแอปเท่านั้น ผ่าน fetch("/api/push-send") — สแปมจึงไม่ทำให้มือถือใครสั่นทั้งคืน
--
-- กับดักฝั่งเว็บ (honeypot + กันกดซ้ำ 30 วินาที) กันบอทกรอกฟอร์มได้ แต่กันสคริปต์ที่ยิงตรงเข้า
-- PostgREST ไม่ได้เลย ชั้นบังคับจริงจึงต้องอยู่ใน policy

-- นับย้อนหลัง 1 นาทีให้เร็ว
create index if not exists web_orders_created_idx on web_orders (created_at desc);

-- ตัวตัดสินว่าจะรับใบนี้ไหม — security definer เพราะ anon อ่าน web_orders ไม่ได้ (อ่านได้เฉพาะพนักงาน)
create or replace function web_order_insert_ok(p_phone text)
returns boolean language sql security definer set search_path = public stable as $fn$
  select
    -- เพดานรวมทั้งเว็บ 30 ใบ/นาที · ของจริงวันละไม่กี่ใบ จึงไม่มีทางชนเพดานจากลูกค้าจริง
    (select count(*) from web_orders where created_at > now() - interval '1 minute') < 30
    -- เบอร์เดิมส่งซ้ำภายใน 1 นาที = กดซ้ำหรือบอทวน ไม่รับ
    and not exists (
      select 1 from web_orders
      where created_at > now() - interval '1 minute'
        and phone = p_phone
    );
$fn$;

revoke all on function web_order_insert_ok(text) from public;
grant execute on function web_order_insert_ok(text) to anon, authenticated;

drop policy if exists web_orders_insert on web_orders;
create policy web_orders_insert on web_orders for insert to anon, authenticated
  with check (web_order_insert_ok(phone));

-- ✅ ตรวจผล: ต้องได้ 1 แถว และคอลัมน์ with_check ต้องมีคำว่า web_order_insert_ok (ไม่ใช่ true)
-- select policyname, with_check from pg_policies
-- where tablename = 'web_orders' and policyname = 'web_orders_insert';

-- 🔙 ถอยกลับ (ถ้าลูกค้าจริงส่งไม่ได้):
-- drop policy if exists web_orders_insert on web_orders;
-- create policy web_orders_insert on web_orders for insert to anon, authenticated with check (true);
--
-- 📌 ข้อแลกที่ต้องรู้: เพดานรวม 30/นาที แปลว่าคนที่ตั้งใจยิงสแปมสามารถกินโควตาจนลูกค้าจริง
--    ส่งไม่ได้ชั่วคราวได้ (ลูกค้าจะเห็นข้อความ error ไม่ใช่เงียบหาย) แลกกับการไม่ให้สแปมทะลักไม่จำกัด
--    ถ้าเจอปัญหานี้จริงค่อยขยับเป็นการนับราย IP ผ่าน edge function แทน
