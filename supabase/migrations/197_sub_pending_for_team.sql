-- 197_sub_pending_for_team.sql
-- หัวหน้าทีมช่างซัพเปิดดู "งานค้างจ่าย" ของทีมตัวเองได้ (อ่านอย่างเดียว)
--
-- ทำไมต้องเป็น RPC security definer (เหมือน jobs_for_team mig 166):
--   ช่างซัพล็อกอินด้วย role tech/lead_tech ซึ่ง "อ่าน quotations/sub_payouts ไม่ได้" (mig 167 ปิดราคา
--   + sub_payouts เปิดให้ admin/exec/finance เท่านั้น mig 042) ⇒ เรียกตารางตรง ๆ จะได้ค่าว่างเงียบ ๆ
--   ฟังก์ชันนี้รันด้วยสิทธิ์เจ้าของฟังก์ชัน แต่ "ล็อกที่ my_team()" — เห็นเฉพาะทีมตัวเอง และเฉพาะทีมที่ type='sub'
--   จึงปลอดภัย: ส่งกลับเฉพาะฟิลด์ที่หัวหน้าทีมควรเห็น (ไม่มีต้นทุน/ราคาขาย/บันทึกภายใน)
--
-- ส่งกลับ 2 กลุ่ม:
--   jobs    = งานที่ยืนยันค่าแรงแล้วและยังจ่ายไม่ครบ (รอออฟฟิศตั้งใบจ่าย)
--   payouts = ใบจ่ายที่ออกแล้วแต่ยังไม่โอน (รอโอนเข้าบัญชีทีม)
-- ยอดค้างจ่ายจริงของทีม = ผลรวม remaining ของ jobs + ผลรวม net ของ payouts
--
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create or replace function sub_pending_for_team()
returns json language sql stable security definer set search_path = public as $fn$
with me as (select my_team() as team),
guard as (                                   -- ต้องเป็นสมาชิก "ทีมช่างซัพ" เท่านั้น ไม่งั้นคืนว่าง
  select m.team from me m
  join teams t on t.id = m.team and t.type = 'sub'
),
jobs as (
  select jo.job_no, jo.scheduled_at, jo.status,
         round(coalesce(jo.labor_total, 0), 2)     as labor_total,
         round(coalesce(jo.labor_paid_amt, 0), 2)  as labor_paid_amt,
         round(coalesce(jo.labor_total, 0) - coalesce(jo.labor_paid_amt, 0), 2) as remaining,
         c.name as customer_name,
         coalesce(q.vat, false) as vat
  from job_orders jo
  join guard g on jo.assigned_team = g.team
  left join customers c on c.id = jo.customer_id
  left join quotations q on q.quote_no = jo.quote_no
  where jo.status <> 'cancelled'
    and jo.labor_confirmed = true
    and coalesce(jo.labor_total, 0) - coalesce(jo.labor_paid_amt, 0) > 0.01
),
pouts as (
  select sp.id, sp.created_at,
         round(coalesce(sp.gross, 0), 2)   as gross,
         round(coalesce(sp.wht_amt, 0), 2) as wht_amt,
         round(coalesce(sp.net, 0), 2)     as net,
         greatest(coalesce(array_length(sp.job_nos, 1), 0),
                  coalesce(jsonb_array_length(sp.lines), 0)) as job_count
  from sub_payouts sp
  join guard g on sp.team = g.team
  where sp.status <> 'paid'
)
select json_build_object(
  'jobs',    coalesce((select json_agg(row_to_json(j) order by j.scheduled_at nulls last) from jobs j),  '[]'::json),
  'payouts', coalesce((select json_agg(row_to_json(p) order by p.created_at)            from pouts p), '[]'::json)
);
$fn$;

grant execute on function sub_pending_for_team() to authenticated;

-- ✅ ตรวจผล (รันด้วยบัญชีหัวหน้าทีมซัพจะเห็นของทีมตัวเอง; รันในเอดิเตอร์ = service role จะได้ว่างเพราะไม่มี my_team())
select 'sub_pending_for_team ready' as status;
