-- 219_kpi_scorecard_adjnotes.sql — ปรับ KPI ยอดขายต่อคน ให้หัก/บวกใบลด-เพิ่มหนี้ (mig 218)
-- ยอดเก็บเงินจริงต่อคน = ใบเสร็จ net + (ใบเพิ่มหนี้ net − ใบลดหนี้ net) ตามวันที่ออกเอกสาร
-- รันใน Supabase → SQL Editor (ครั้งเดียว) · แทนที่ฟังก์ชันเดิมจาก mig 198

create or replace function kpi_scorecard(p_from date, p_to date)
returns json language sql stable security definer set search_path = public as $fn$
with allow as (select my_role() in ('admin','exec','hr','finance') as ok),
q as (
  select q.created_by as uid,
         count(*) filter (where q.status <> 'cancelled') as quotes,
         count(*) filter (where q.status = 'approved')    as won
  from quotations q, allow
  where allow.ok
    and q.issue_date between p_from and p_to
    and q.created_by is not null
  group by q.created_by
),
r as (
  select rc.created_by as uid, coalesce(sum(rc.net),0) as revenue
  from receipts rc, allow
  where allow.ok
    and rc.issue_date between p_from and p_to
    and rc.status <> 'cancelled'
    and rc.created_by is not null
  group by rc.created_by
),
-- ── ใบลด/เพิ่มหนี้ (mig 218): credit ลบ · debit บวก ต่อคน ──
adj as (
  select an.created_by as uid,
         coalesce(sum(case when an.kind = 'debit' then an.net else -an.net end),0) as adj_rev
  from adjustment_notes an, allow
  where allow.ok
    and an.issue_date between p_from and p_to
    and an.status = 'issued'
    and an.created_by is not null
  group by an.created_by
),
sales as (
  select p.id as user_id, p.name, p.role,
         coalesce(q.quotes,0) as quotes,
         coalesce(q.won,0)    as won,
         case when coalesce(q.quotes,0) > 0 then round(100.0*q.won/q.quotes) else null end as close_rate,
         coalesce(r.revenue,0) + coalesce(adj.adj_rev,0) as revenue
  from profiles p
  left join q   on q.uid   = p.id
  left join r   on r.uid   = p.id
  left join adj on adj.uid = p.id
  where coalesce(q.quotes,0) > 0 or coalesce(r.revenue,0) > 0 or coalesce(adj.adj_rev,0) <> 0
),
jt as (
  select jo.assigned_team as team_id,
         count(*) filter (where jo.status = 'done')                    as jobs_done,
         count(*) filter (where jo.status = 'done' and jo.is_claim)    as claims,
         avg(jo.rating) filter (where jo.rating > 0)                   as rating_avg
  from job_orders jo, allow
  where allow.ok
    and jo.assigned_team is not null
    and coalesce(jo.issue_date, jo.scheduled_at::date, jo.created_at::date) between p_from and p_to
  group by jo.assigned_team
),
teams as (
  select t.id as team_id, t.name, coalesce(t.type,'permanent') as type,
         jt.jobs_done, jt.claims,
         case when jt.jobs_done > 0 then round(100.0*jt.claims/jt.jobs_done,1) else 0 end as claim_rate,
         round(jt.rating_avg::numeric,1) as rating_avg
  from teams t join jt on jt.team_id = t.id
  where jt.jobs_done > 0
)
select json_build_object(
  'sales', coalesce((select json_agg(row_to_json(s) order by s.revenue desc, s.won desc) from sales s), '[]'::json),
  'teams', coalesce((select json_agg(row_to_json(x) order by x.jobs_done desc)           from teams x), '[]'::json)
);
$fn$;

grant execute on function kpi_scorecard(date, date) to authenticated;

select 'kpi_scorecard adjnotes ready' as status;
