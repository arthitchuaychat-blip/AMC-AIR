-- Emergency rollback for v831. Apply through a new recorded migration, then deploy v830.
-- Leaves the private HR bucket intact so uploaded personnel files are never made public.
DO $$ DECLARE x record; BEGIN FOR x IN SELECT schemaname,tablename,policyname FROM pg_policies WHERE policyname like 'role_v831_%' OR policyname like 'hr_docs_%v831' LOOP EXECUTE format('DROP POLICY %I ON %I.%I',x.policyname,x.schemaname,x.tablename); END LOOP; FOR x IN SELECT tgname,tgrelid::regclass as tab FROM pg_trigger WHERE not tgisinternal AND tgname like '%v831' LOOP EXECUTE format('DROP TRIGGER %I ON %s',x.tgname,x.tab); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
           when role = 'assistant'   then 'tech'
           when role = 'field_sales' then 'sales'
           else role
         end
  from profiles where id = auth.uid()
$function$
;
grant execute on function public.my_role() to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.profiles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor text := my_role();
  is_self boolean := (auth.uid() = new.id);
begin
  -- เรียกจาก service role / ไม่มี session → ปล่อยผ่าน (สคริปต์ผู้ดูแลระบบ)
  if auth.uid() is null then return new; end if;

  -- 1) ตำแหน่ง (role) — เฉพาะผู้บริหาร/ธุรการ
  if new.role is distinct from old.role and actor not in ('admin', 'exec') then
    raise exception 'ไม่มีสิทธิ์เปลี่ยนตำแหน่ง (role) — ต้องให้ธุรการ/ผู้บริหารเป็นผู้เปลี่ยน';
  end if;

  -- 2) ข้อมูลค่าจ้าง/ข้อมูลอ่อนไหว — เฉพาะ admin/exec/hr และห้ามแก้ของตัวเอง
  if (new.base_pay    is distinct from old.base_pay
   or new.ot_rate     is distinct from old.ot_rate
   or new.pay_type    is distinct from old.pay_type
   or new.sso         is distinct from old.sso
   or new.citizen_id  is distinct from old.citizen_id) then
    if actor not in ('admin', 'exec', 'hr') then
      raise exception 'ไม่มีสิทธิ์แก้ข้อมูลค่าจ้าง/เลขบัตรประชาชน';
    end if;
    if is_self and actor not in ('admin', 'exec') then
      raise exception 'แก้ข้อมูลค่าจ้างของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารเป็นผู้แก้';
    end if;
  end if;

  return new;
end $function$
;
grant execute on function public.profiles_guard() to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.email), 'tech')
  on conflict (id) do nothing;
  return new;
end; $function$
;
grant execute on function public.handle_new_user() to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.hr_att_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if my_role() in ('admin','exec','hr') then return new; end if;
  if tg_op = 'INSERT' then
    new.ot_ok := null;
    new.work_date := (now() at time zone 'Asia/Bangkok')::date;
    if new.check_in_at is not null then
      new.client_in_at := new.check_in_at;
      new.skew_sec := round(extract(epoch from (new.check_in_at - now())))::int;
      new.check_in_at := now();
    end if;
    if new.check_out_at is not null then
      new.client_out_at := new.check_out_at;
      new.check_out_at := now();
    end if;
    return new;
  end if;
  new.ot_ok := old.ot_ok;
  if old.check_in_at is not null and new.check_in_at is distinct from old.check_in_at then
    raise exception 'แก้เวลาเช็คอินไม่ได้ — แจ้งฝ่ายบุคคลแก้ให้';
  end if;
  if old.check_out_at is not null and new.check_out_at is distinct from old.check_out_at then
    raise exception 'แก้เวลาเช็คเอาท์ไม่ได้ — แจ้งฝ่ายบุคคลแก้ให้';
  end if;
  if old.check_in_at is null and new.check_in_at is not null then
    new.client_in_at := new.check_in_at;
    new.skew_sec := round(extract(epoch from (new.check_in_at - now())))::int;
    new.check_in_at := now();
  end if;
  if old.check_out_at is null and new.check_out_at is not null then
    new.client_out_at := new.check_out_at;
    new.check_out_at := now();
  end if;
  return new;
end $function$
;
grant execute on function public.hr_att_guard() to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.jobs_for_team(p_team text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with scope as (
    select case when my_role() = 'tech' then my_team() else p_team end as team
  ),
  j as (
    select jo.*
    from job_orders jo, scope s
    where my_role() in ('tech','lead_tech','admin','exec','finance','sales','hr','stock')
      and not (my_role() = 'tech' and my_team() is null)
      and (
        (s.team is null and my_role() <> 'tech')
        or jo.assigned_team = s.team
        or exists (select 1 from job_visits v where v.job_no = jo.job_no and v.assigned_team = s.team)
      )
  )
  select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json) from (
    select
      j.job_no, j.quote_no, j.customer_id, j.site_id, j.title, j.group_no, j.job_type,
      j.contact_name, j.contact_phone, j.address, j.map_url, j.details,
      j.sales_note, j.sales_photos, j.assigned_team, j.scheduled_at, j.end_date, j.slot,
      j.status, j.completion_note, j.photos, j.created_at, j.created_by, j.locked, j.issue_date,
      c.name  as customer_name,
      c.address as customer_address,
      cs.site_name, cs.address as site_address, cs.map_url as site_map_url,
      cs.contact_name as site_contact_name, cs.phone as site_phone,
      (select json_build_object('name', cc.name, 'phone', cc.phone)
         from customer_contacts cc where cc.customer_id = j.customer_id order by cc.id limit 1) as main_contact,
      q.boq_no,
      (select t.name from teams t where t.id = j.assigned_team) as team_name,
      (select coalesce(json_agg(json_build_object('name', qi.name, 'qty', qi.qty, 'unit', qi.unit) order by qi.id), '[]'::json)
         from quotation_items qi
        where qi.quote_no = j.quote_no and qi.kind in ('ac','service')) as confirm_items,
      (select coalesce(json_agg(json_build_object(
                'id', v.id, 'job_no', v.job_no, 'visit_date', v.visit_date, 'end_date', v.end_date,
                'slot', v.slot, 'scheduled_at', v.scheduled_at, 'status', v.status,
                'assigned_team', v.assigned_team, 'note', v.note,
                'teamName', (select t.name from teams t where t.id = v.assigned_team)
              ) order by v.visit_date, v.id), '[]'::json)
         from job_visits v where v.job_no = j.job_no) as visits
    from j
    left join customers      c  on c.id  = j.customer_id
    left join customer_sites cs on cs.id = j.site_id
    left join quotations     q  on q.quote_no = j.quote_no
  ) x;
$function$
;
grant execute on function public.jobs_for_team(p_team text) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.set_visit_status(p_visit_id bigint, p_status text, p_job_override text DEFAULT NULL::text, p_lock boolean DEFAULT NULL::boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_job text; v_team text; v_cur text; v_jstatus text; v_locked boolean;
begin
  select job_no, assigned_team, status into v_job, v_team, v_cur from job_visits where id = p_visit_id;
  if v_job is null then raise exception 'visit not found'; end if;
  if not (my_role() in ('admin','sales','exec','finance','hr','stock','lead_tech')
          or (my_role() = 'tech' and v_team = my_team())) then
    raise exception 'not allowed';
  end if;
  select status, coalesce(locked, false) into v_jstatus, v_locked from job_orders where job_no = v_job;
  if v_jstatus = 'cancelled' then raise exception 'ใบงานถูกยกเลิกแล้ว — เปลี่ยนสถานะรอบไม่ได้ (รีเฟรชหน้าจอ)'; end if;
  if my_role() = 'tech' then
    if v_locked then raise exception 'ใบงานถูกอนุมัติปิดแล้ว — แก้ไม่ได้ (รีเฟรชหน้าจอ)'; end if;
    if v_cur = 'done' then raise exception 'รอบนี้อนุมัติปิดแล้ว — แก้ไม่ได้'; end if;
    if p_status not in ('in_progress','awaiting_approval','reschedule') then
      raise exception 'สถานะนี้ออฟฟิศเป็นคนตั้งเท่านั้น';
    end if;
    if p_job_override is not null or p_lock is not null then raise exception 'not allowed'; end if;
  end if;
  update job_visits set status = p_status where id = p_visit_id;
  if p_job_override is not null then
    update job_orders set status = p_job_override, locked = coalesce(p_lock, locked) where job_no = v_job;
    return p_job_override;
  end if;
  if p_lock is not null then update job_orders set locked = p_lock where job_no = v_job; end if;
  return recompute_job_status(v_job);
end $function$
;
grant execute on function public.set_visit_status(p_visit_id bigint, p_status text, p_job_override text, p_lock boolean) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.set_job_visits_status(p_job text, p_from text[], p_to text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (my_role() in ('admin','sales','exec','finance','hr','stock','lead_tech')) then
    raise exception 'not allowed';
  end if;
  if p_to <> 'cancelled' and (select status from job_orders where job_no = p_job) = 'cancelled' then
    raise exception 'ใบงานถูกยกเลิกแล้ว';
  end if;
  update job_visits set status = p_to where job_no = p_job and status = any(p_from);
  return recompute_job_status(p_job);
end $function$
;
grant execute on function public.set_job_visits_status(p_job text, p_from text[], p_to text) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.set_job_status(p_job text, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cur text; v_locked boolean; v_team text;
begin
  select status, coalesce(locked, false), assigned_team into v_cur, v_locked, v_team from job_orders where job_no = p_job;
  if v_cur is null then raise exception 'job not found'; end if;
  if my_role() in ('admin','sales','exec','finance','hr','stock','lead_tech') then
    null;  -- ออฟฟิศ/หัวหน้าช่าง เปลี่ยนได้ทุกสถานะ (รวมยกเลิก/คืนชีพ)
  elsif my_role() = 'tech' then
    if v_cur in ('done','cancelled') or v_locked then raise exception 'งานถูกปิด/ยกเลิกแล้ว (รีเฟรชหน้าจอ)'; end if;
    if p_status not in ('in_progress','awaiting_approval','reschedule') then
      raise exception 'สถานะนี้ออฟฟิศเป็นคนตั้งเท่านั้น';
    end if;
    if not (v_team = my_team()
            or exists (select 1 from job_visits where job_no = p_job and assigned_team = my_team())) then
      raise exception 'not allowed';
    end if;
  else
    raise exception 'not allowed';
  end if;
  update job_orders set status = p_status where job_no = p_job;
  -- ยกเลิกใบงาน → ปิดรอบที่ยังไม่จบด้วย (ต้นเหตุงานคืนชีพ: รอบยังเดินอยู่หลังยกเลิก)
  if p_status = 'cancelled' then
    update job_visits set status = 'cancelled' where job_no = p_job and status not in ('done','cancelled');
  end if;
  return p_status;
end $function$
;
grant execute on function public.set_job_status(p_job text, p_status text) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.sub_pending_for_team()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with me as (select my_team() as team),
guard as (
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
$function$
;
grant execute on function public.sub_pending_for_team() to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.kpi_scorecard(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allow as (select my_role() in ('admin','exec','hr','finance') as ok),
q as (select q.created_by as uid, count(*) filter (where q.status <> 'cancelled') as quotes, count(*) filter (where q.status = 'approved') as won
  from quotations q, allow where allow.ok and q.issue_date between p_from and p_to and q.created_by is not null group by q.created_by),
r as (select rc.created_by as uid, coalesce(sum(rc.net),0) as revenue from receipts rc, allow
  where allow.ok and rc.issue_date between p_from and p_to and rc.status <> 'cancelled' and rc.created_by is not null group by rc.created_by),
sales as (select p.id as user_id, p.name, p.role, coalesce(q.quotes,0) as quotes, coalesce(q.won,0) as won,
  case when coalesce(q.quotes,0)>0 then round(100.0*q.won/q.quotes) else null end as close_rate, coalesce(r.revenue,0) as revenue
  from profiles p left join q on q.uid=p.id left join r on r.uid=p.id where coalesce(q.quotes,0)>0 or coalesce(r.revenue,0)>0),
jt as (select jo.assigned_team as team_id, count(*) filter (where jo.status='done') as jobs_done,
  count(*) filter (where jo.status='done' and jo.is_claim) as claims, avg(jo.rating) filter (where jo.rating>0) as rating_avg,
  avg(jo.cust_rating) filter (where jo.cust_rating>0) as cust_rating_avg, count(jo.cust_rating) filter (where jo.cust_rating>0) as cust_rating_n
  from job_orders jo, allow where allow.ok and jo.assigned_team is not null
    and coalesce(jo.issue_date, jo.scheduled_at::date, jo.created_at::date) between p_from and p_to group by jo.assigned_team),
teams as (select t.id as team_id, t.name, coalesce(t.type,'permanent') as type, jt.jobs_done, jt.claims,
  case when jt.jobs_done>0 then round(100.0*jt.claims/jt.jobs_done,1) else 0 end as claim_rate,
  round(jt.rating_avg::numeric,1) as rating_avg, round(jt.cust_rating_avg::numeric,1) as cust_rating_avg, coalesce(jt.cust_rating_n,0) as cust_rating_n
  from teams t join jt on jt.team_id=t.id where jt.jobs_done>0)
select json_build_object(
  'sales', coalesce((select json_agg(row_to_json(s) order by s.revenue desc, s.won desc) from sales s),'[]'::json),
  'teams', coalesce((select json_agg(row_to_json(x) order by x.jobs_done desc) from teams x),'[]'::json));
$function$
;
grant execute on function public.kpi_scorecard(p_from date, p_to date) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.expense_attach_receipt(p_id uuid, p_urls text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_urls is null or array_length(p_urls, 1) is null then
    raise exception 'ไม่มีรูปที่จะแนบ';
  end if;
  update expense_requests
  set attachments = attachments || p_urls
  where id = p_id
    and (requester = auth.uid() or my_role() in ('admin','exec','finance','hr'));
  if not found then
    raise exception 'ไม่พบคำขอเบิก หรือไม่มีสิทธิ์แนบใบเสร็จรายการนี้';
  end if;
end $function$
;
grant execute on function public.expense_attach_receipt(p_id uuid, p_urls text[]) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.line_bump_unread(p_uid text, p_msg text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update line_contacts set unread = unread + 1, last_message = p_msg, last_message_at = now()
  where line_user_id = p_uid;
$function$
;
grant execute on function public.line_bump_unread(p_uid text, p_msg text) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.recompute_job_status(p_job text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text;
begin
  if (select status from job_orders where job_no = p_job) = 'cancelled' then return 'cancelled'; end if;
  select case
    when count(*) filter (where status <> 'cancelled') = 0
      then (case when count(*) > 0 then 'cancelled' else 'pending' end)
    when count(*) filter (where status <> 'cancelled' and status <> 'done') = 0 then 'done'
    when count(*) filter (where status = 'in_progress') > 0 then 'in_progress'
    when count(*) filter (where status = 'awaiting_approval') > 0 then 'awaiting_approval'
    when count(*) filter (where status = 'reschedule') > 0 then 'reschedule'
    when count(*) filter (where status = 'scheduled') > 0 then 'scheduled'
    else 'pending'
  end into v
  from job_visits where job_no = p_job;
  if v is null then v := 'pending'; end if;
  update job_orders set status = v where job_no = p_job;
  return v;
end $function$
;
grant execute on function public.recompute_job_status(p_job text) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.claim_receipt_flowaccount(p_receipt_no text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare claimed int;
begin
  if my_role() not in ('admin','exec','finance','sales','hr') then raise exception 'forbidden'; end if;
  update receipts set flowaccount_at = now()
   where receipt_no = p_receipt_no
     and flowaccount_id is null
     and flowaccount_at is null;
  get diagnostics claimed = row_count;
  return claimed > 0;
end; $function$
;
grant execute on function public.claim_receipt_flowaccount(p_receipt_no text) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.release_receipt_flowaccount(p_receipt_no text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if my_role() not in ('admin','exec','finance','sales','hr') then raise exception 'forbidden'; end if;
  update receipts set flowaccount_at = null
   where receipt_no = p_receipt_no and flowaccount_id is null;
end; $function$
;
grant execute on function public.release_receipt_flowaccount(p_receipt_no text) to authenticated,service_role,anon;
CREATE OR REPLACE FUNCTION public.set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare done int;
begin
  if my_role() not in ('admin','exec','finance','sales','hr') then raise exception 'forbidden'; end if;
  update receipts
     set flowaccount_id = nullif(p_fa_id, ''),
         flowaccount_no = nullif(p_fa_no, ''),
         flowaccount_at = now()
   where receipt_no = p_receipt_no
     and flowaccount_id is null;
  get diagnostics done = row_count;
  return done > 0;
end; $function$
;
grant execute on function public.set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text) to authenticated,service_role,anon;
UPDATE public.app_config SET value=value || '{"exec": {"accounting": "edit", "adjnote": "edit", "assets": "edit", "attendance": "edit", "billing": "edit", "boq": "edit", "cashflow": "edit", "catalog": "edit", "chat": "edit", "customers": "edit", "dashboard": "view", "email": "edit", "expenses": "edit", "followup": "view", "handbook": "view", "handover": "edit", "hr": "edit", "invoice": "edit", "joborders": "edit", "jobs": "edit", "kpi": "view", "loans": "edit", "marketing": "edit", "movements": "edit", "myjobs": "none", "payables": "view", "paycenter": "edit", "pipeline": "edit", "po": "edit", "prep": "edit", "profit": "view", "promo": "edit", "quote": "edit", "receipt": "edit", "receivables": "view", "recurring": "edit", "recvcenter": "edit", "reviews": "edit", "saleshub": "edit", "schedule": "edit", "settings": "edit", "stockcount": "edit", "subcontract": "edit", "suppliers": "edit", "tasks": "edit", "tax": "view", "teamchat": "edit", "tools": "edit", "weborders": "view", "website": "edit"}, "admin": {"accounting": "edit", "adjnote": "edit", "assets": "edit", "attendance": "edit", "billing": "edit", "boq": "edit", "cashflow": "edit", "catalog": "edit", "chat": "edit", "customers": "edit", "dashboard": "view", "email": "edit", "expenses": "edit", "followup": "view", "handbook": "view", "handover": "edit", "hr": "edit", "invoice": "edit", "joborders": "edit", "jobs": "edit", "kpi": "view", "loans": "edit", "marketing": "edit", "movements": "edit", "myjobs": "none", "payables": "view", "paycenter": "edit", "pipeline": "edit", "po": "edit", "prep": "edit", "profit": "view", "promo": "edit", "quote": "edit", "receipt": "edit", "receivables": "view", "recurring": "edit", "recvcenter": "edit", "reviews": "edit", "saleshub": "edit", "schedule": "edit", "settings": "edit", "stockcount": "edit", "subcontract": "edit", "suppliers": "edit", "tasks": "edit", "tax": "view", "teamchat": "edit", "tools": "edit", "weborders": "view", "website": "edit"}, "hr": {"adjnote": "edit", "assets": "view", "attendance": "edit", "billing": "edit", "boq": "edit", "cashflow": "edit", "catalog": "edit", "chat": "edit", "customers": "edit", "dashboard": "view", "email": "edit", "expenses": "edit", "followup": "view", "handbook": "view", "handover": "edit", "hr": "edit", "invoice": "edit", "joborders": "edit", "jobs": "edit", "kpi": "view", "loans": "view", "marketing": "edit", "movements": "edit", "myjobs": "none", "payables": "view", "paycenter": "edit", "pipeline": "edit", "po": "edit", "prep": "edit", "profit": "view", "promo": "edit", "quote": "edit", "receipt": "edit", "receivables": "view", "recurring": "view", "recvcenter": "edit", "reviews": "edit", "saleshub": "edit", "schedule": "edit", "settings": "none", "stockcount": "edit", "subcontract": "edit", "suppliers": "edit", "tasks": "edit", "tax": "view", "teamchat": "edit", "tools": "view", "weborders": "view", "website": "none"}}'::jsonb,updated_at=now() WHERE key='role_permissions';
alter view public.material_stock reset (security_invoker); grant select on public.material_stock to anon;
alter policy txn_admin_delete on public.transactions using ((my_role() = 'admin'::text));
alter policy prof_admin_insert on public.profiles with check ((my_role() = 'admin'::text));
alter policy prof_admin_write on public.profiles using ((my_role() = 'admin'::text)) with check ((my_role() = 'admin'::text));
alter policy inv_write_del on public.invoices using ((my_role() = 'admin'::text));
alter policy rc_write_del on public.receipts using ((my_role() = 'admin'::text));
alter policy boq_write_del on public.boqs using ((my_role() = 'admin'::text));
alter policy qt_write_del on public.quotations using ((my_role() = 'admin'::text));
alter policy team_write on public.teams using ((my_role() = 'admin'::text)) with check ((my_role() = 'admin'::text));
alter policy bn_write_del on public.billing_notes using ((my_role() = 'admin'::text));
alter policy job_handovers_del on public.job_handovers using (((my_role() = 'admin'::text) OR ((created_by = auth.uid()) AND (status = 'draft'::text))));
