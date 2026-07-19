-- 166: ใบงานสำหรับจอช่าง — ไม่มีข้อมูลราคาติดไปด้วย (รีวิว "กลาง" ข้อ 15)
--
-- ⚠️ ห้ามใช้ j.* / to_jsonb(j) — job_orders มี labor_lines (เก็บ {price,disc,sale} ที่ก็อปมาจากใบเสนอราคา)
--    internal_note (mig 055 ตั้งใจซ่อนจากช่าง) labor_total/payout_id/rating/is_claim
--    ต้องไล่ระบุคอลัมน์ที่ปลอดภัยเองเท่านั้น
-- คืนเป็น json ก้อนเดียว → ไม่โดนเพดาน 1000 แถว

create or replace function jobs_for_team(p_team text default null)
returns json language sql stable security definer set search_path = public as $fn$
with s as (select case when my_role()='tech' then my_team() else p_team end as team),
j as (
  select jo.* from job_orders jo, s
  where my_role() in ('tech','lead_tech','admin','exec','finance','sales','hr','stock')
    and not (my_role()='tech' and my_team() is null)
    and ((s.team is null and my_role()<>'tech')
      or jo.assigned_team = s.team
      or exists (select 1 from job_visits v where v.job_no=jo.job_no and v.assigned_team=s.team))
)
select coalesce(json_agg(row_to_json(x) order by x.created_at desc),'[]'::json) from (
  select j.job_no, j.quote_no, j.customer_id, j.site_id, j.title, j.group_no, j.job_type,
    j.contact_name, j.contact_phone, j.address, j.map_url, j.details, j.sales_note, j.sales_photos,
    j.assigned_team, j.scheduled_at, j.end_date, j.slot, j.status, j.completion_note, j.photos,
    j.created_at, j.created_by, j.locked, j.issue_date,
    c.name as customer_name, c.address as customer_address,
    cs.site_name, cs.address as site_address, cs.map_url as site_map_url,
    cs.contact_name as site_contact_name, cs.phone as site_phone,
    (select json_build_object('name',cc.name,'phone',cc.phone) from customer_contacts cc
      where cc.customer_id=j.customer_id order by cc.id limit 1) as main_contact,
    q.boq_no, (select t.name from teams t where t.id=j.assigned_team) as team_name,
    (select coalesce(json_agg(json_build_object('name',qi.name,'qty',qi.qty,'unit',qi.unit) order by qi.id),'[]'::json)
      from quotation_items qi where qi.quote_no=j.quote_no and qi.kind in ('ac','service')) as confirm_items,
    (select coalesce(json_agg(to_jsonb(v) || jsonb_build_object('teamName',
        (select t2.name from teams t2 where t2.id=v.assigned_team)) order by v.visit_date, v.id),'[]'::json)
      from job_visits v where v.job_no=j.job_no) as visits
  from j
  left join customers c on c.id=j.customer_id
  left join customer_sites cs on cs.id=j.site_id
  left join quotations q on q.quote_no=j.quote_no
) x;
$fn$;

grant execute on function jobs_for_team(text) to authenticated;

-- ✅ ตรวจที่ตัวฟังก์ชัน (ไม่ขึ้นกับ role ที่รัน) — ต้องได้ false, false, true
-- select pg_get_functiondef(oid) ~ 'j\.\*' as ใช้_j_star,
--        pg_get_functiondef(oid) ~ '(labor_lines|internal_note|labor_total|payout_id|rating|is_claim)' as มีคอลัมน์ต้องห้าม,
--        pg_get_functiondef(oid) ~ 'my_team\(\) is null' as กันช่างไม่มีทีม
-- from pg_proc where proname = 'jobs_for_team';
