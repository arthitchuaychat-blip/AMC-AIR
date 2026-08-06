-- 201_kpi_scorecard_cust_rating.sql — ป้อน "คะแนนความพอใจลูกค้า" เข้าสกอร์การ์ดทีม (ปิด loop ข้อ 3→ข้อ 1)
--
-- อัปเกรด kpi_scorecard (mig 198): เพิ่ม cust_rating_avg + cust_rating_n ต่อทีม
-- คะแนนลูกค้ามาจาก job_handovers.cust_rating (mig 200) → เชื่อม job_no → assigned_team
-- ช่วงเวลาใช้วันของงาน (เหมือน jobs_done) ให้คะแนนสะท้อนงานในเดือนนั้น
--
-- ต้องรัน mig 200 ก่อน · รันใน Supabase → SQL Editor (ครั้งเดียว)

create or replace function kpi_scorecard(p_from date, p_to date)
returns json language sql stable security definer set search_path = public as $fn$
with allow as (select my_role() in ('admin','exec','hr','finance') as ok),
q as (
  select q.created_by as uid,
         count(*) filter (where q.status <> 'cancelled') as quotes,
         count(*) filter (where q.status = 'approved')    as won
  from quotations q, allow
  where allow.ok and q.issue_date between p_from and p_to and q.created_by is not null
  group by q.created_by
),
r as (
  select rc.created_by as uid, coalesce(sum(rc.net),0) as revenue
  from receipts rc, allow
  where allow.ok and rc.issue_date between p_from and p_to and rc.status <> 'cancelled' and rc.created_by is not null
  group by rc.created_by
),
sales as (
  select p.id as user_id, p.name, p.role,
         coalesce(q.quotes,0) as quotes, coalesce(q.won,0) as won,
         case when coalesce(q.quotes,0) > 0 then round(100.0*q.won/q.quotes) else null end as close_rate,
         coalesce(r.revenue,0) as revenue
  from profiles p left join q on q.uid = p.id left join r on r.uid = p.id
  where coalesce(q.quotes,0) > 0 or coalesce(r.revenue,0) > 0
),
jt as (
  select jo.assigned_team as team_id,
         count(*) filter (where jo.status = 'done')                 as jobs_done,
         count(*) filter (where jo.status = 'done' and jo.is_claim) as claims,
         avg(jo.rating) filter (where jo.rating > 0)                as rating_avg
  from job_orders jo, allow
  where allow.ok and jo.assigned_team is not null
    and coalesce(jo.issue_date, jo.scheduled_at::date, jo.created_at::date) between p_from and p_to
  group by jo.assigned_team
),
-- คะแนนความพอใจลูกค้า ต่อทีม (ผ่าน handover → job → team) · mig 200
cr as (
  select jo.assigned_team as team_id,
         avg(h.cust_rating)   as cust_rating_avg,
         count(h.cust_rating) as cust_rating_n
  from job_handovers h
  join job_orders jo on jo.job_no = h.job_no, allow
  where allow.ok and h.cust_rating is not null
    and coalesce(jo.issue_date, jo.scheduled_at::date, jo.created_at::date) between p_from and p_to
  group by jo.assigned_team
),
teams as (
  select t.id as team_id, t.name, coalesce(t.type,'permanent') as type,
         jt.jobs_done, jt.claims,
         case when jt.jobs_done > 0 then round(100.0*jt.claims/jt.jobs_done,1) else 0 end as claim_rate,
         round(jt.rating_avg::numeric,1)  as rating_avg,
         round(cr.cust_rating_avg::numeric,1) as cust_rating_avg,
         coalesce(cr.cust_rating_n,0)     as cust_rating_n
  from teams t
  join jt on jt.team_id = t.id
  left join cr on cr.team_id = t.id
  where jt.jobs_done > 0
)
select json_build_object(
  'sales', coalesce((select json_agg(row_to_json(s) order by s.revenue desc, s.won desc) from sales s), '[]'::json),
  'teams', coalesce((select json_agg(row_to_json(x) order by x.jobs_done desc)           from teams x), '[]'::json)
);
$fn$;

grant execute on function kpi_scorecard(date, date) to authenticated;

select 'kpi_scorecard + cust rating ready' as status;
