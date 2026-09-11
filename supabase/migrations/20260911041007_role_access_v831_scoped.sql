-- Narrow replacement: only executive/manager authority, HR-only access and employee payroll privacy.
-- All other saved role matrices and existing workflow policies are retained.
-- No blanket grants or general stock/customer/task workflow changes.
create or replace function public.app_actor_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and active is distinct from false $$;
revoke all on function public.app_actor_role() from public;
grant execute on function public.app_actor_role() to authenticated, anon, service_role;
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public
as $$ select case public.app_actor_role() when 'field_sales' then 'sales' when 'assistant' then 'tech' else coalesce(public.app_actor_role(),'none') end $$;

create or replace function public.app_can(p_module text, p_write boolean default false) returns boolean
language plpgsql stable security definer set search_path = public
as $$ declare r text := public.app_actor_role(); v text; begin
 if r is null then return false; end if;
 if p_module = 'permissions' then return r = 'exec'; end if;
 if r in ('exec','admin') then return true; end if;
 if p_module = 'attendance' then return true; end if;
 if r = 'hr' and p_module not in ('teamchat','tasks','attendance','handbook','hr','expenses','paycenter') then return false; end if;
 if p_module = 'hr' and r <> 'hr' then return false; end if;
 select value->r->>p_module into v from public.app_config where key='role_permissions';
 return coalesce(case when p_write then v='edit' else v in ('edit','view') end,false);
end $$;
revoke all on function public.app_can(text,boolean) from public;
grant execute on function public.app_can(text,boolean) to authenticated, anon, service_role;

create or replace function public.role_config_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
 if auth.uid() is null and coalesce(auth.role(),'') <> 'authenticated' then return coalesce(new,old); end if;
 if (coalesce(new.key,'')='role_permissions' or coalesce(old.key,'')='role_permissions') and public.app_actor_role() is distinct from 'exec' then
  raise exception 'เฉพาะผู้บริหารเปลี่ยนสิทธิ์ได้' using errcode='42501';
 end if;
 return coalesce(new,old);
end $$;
create trigger role_config_guard_v831 before insert or update or delete on public.app_config for each row execute function public.role_config_guard();

create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r text:=public.app_actor_role(); begin
 if auth.uid() is null and coalesce(auth.role(),'') <> 'authenticated' then return new; end if;
 if r is null then raise exception 'บัญชีไม่มีสิทธิ์ใช้งาน' using errcode='42501'; end if;
 if new.id is distinct from old.id then raise exception 'เปลี่ยนรหัสบัญชีไม่ได้' using errcode='42501'; end if;
 if new.role is distinct from old.role and r <> 'exec' then raise exception 'เฉพาะผู้บริหารเปลี่ยนสิทธิ์ได้' using errcode='42501'; end if;
 if old.role='exec' and r <> 'exec' and (new.email is distinct from old.email or new.active is distinct from old.active) then raise exception 'เปลี่ยนบัญชีผู้บริหารไม่ได้' using errcode='42501'; end if;
 if r not in ('exec','admin') then
  if (to_jsonb(new)-array['name','avatar_url','signature_url','department','work_pattern','sat_group','hire_date','citizen_id','active','team']) is distinct from
     (to_jsonb(old)-array['name','avatar_url','signature_url','department','work_pattern','sat_group','hire_date','citizen_id','active','team']) then
   raise exception 'การเปลี่ยนค่าจ้างหรือบัญชีต้องให้ผู้บริหาร/ผู้จัดการดำเนินการ' using errcode='42501';
  end if;
  if r <> 'hr' and (to_jsonb(new)-array['name','avatar_url','signature_url']) is distinct from (to_jsonb(old)-array['name','avatar_url','signature_url']) then raise exception 'แก้ข้อมูลการจ้างหรือทีมเองไม่ได้' using errcode='42501'; end if;
  if r='hr' and new.id=auth.uid() and (to_jsonb(new)-array['name','avatar_url','signature_url']) is distinct from (to_jsonb(old)-array['name','avatar_url','signature_url']) then raise exception 'ให้ผู้บริหาร/ผู้จัดการแก้ข้อมูลการจ้างของตนเอง' using errcode='42501'; end if;
 end if;
 return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$ begin
 insert into public.profiles(id,email,name,role,active)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'name',new.email),'tech',false) on conflict(id) do nothing;
 return new;
end $$;

create or replace view public.staff_directory with (security_barrier=true) as
 select id,name,email,role,team,department,avatar_url,active from public.profiles where auth.uid() is not null and public.app_actor_role() is not null;
revoke all on public.staff_directory from public,anon;
grant select on public.staff_directory to authenticated,service_role;

create or replace view public.team_directory with (security_barrier=true) as
 select id,name,lead,van,color,type,phone from public.teams where auth.uid() is not null and public.app_actor_role() is not null;
revoke all on public.team_directory from public,anon;
grant select on public.team_directory to authenticated,service_role;
create or replace function public.list_teams_for_role() returns json
language sql stable security definer set search_path=public as $$
 select coalesce(json_agg(case when public.app_actor_role() in ('exec','admin','finance') then to_jsonb(t)
 else to_jsonb(t)-array['payout_rate','tax_id','bank_info'] end order by t.id),'[]'::json)
 from public.teams t where public.app_actor_role() is not null;
$$;
revoke all on function public.list_teams_for_role() from public,anon;
grant execute on function public.list_teams_for_role() to authenticated,service_role;

create policy role_v831_select on public.hr_leave_quota as restrictive for select to authenticated using ((select public.app_actor_role()) is not null and ((user_id=auth.uid() or (select public.app_actor_role()) in ('exec','admin','hr'))));

create policy role_v831_insert on public.hr_leave_quota as restrictive for insert to authenticated with check ((select public.app_actor_role()) is not null and (((select public.app_actor_role()) in ('exec','admin') or ((select public.app_actor_role())='hr' and user_id<>auth.uid()))));

create policy role_v831_update on public.hr_leave_quota as restrictive for update to authenticated using ((select public.app_actor_role()) is not null and (((select public.app_actor_role()) in ('exec','admin') or ((select public.app_actor_role())='hr' and user_id<>auth.uid())))) with check ((select public.app_actor_role()) is not null and (((select public.app_actor_role()) in ('exec','admin') or ((select public.app_actor_role())='hr' and user_id<>auth.uid()))));

create policy role_v831_delete on public.hr_leave_quota as restrictive for delete to authenticated using ((select public.app_actor_role()) is not null and (((select public.app_actor_role()) in ('exec','admin') or ((select public.app_actor_role())='hr' and user_id<>auth.uid()))));

create policy role_v831_select on public.hr_pay as restrictive for select to authenticated using ((select public.app_actor_role()) is not null and ((user_id=auth.uid() or (select public.app_actor_role()) in ('exec','admin','hr'))));

create policy role_v831_insert on public.hr_pay as restrictive for insert to authenticated with check ((select public.app_actor_role()) is not null and ((select public.app_actor_role()) in ('exec','admin')));

create policy role_v831_update on public.hr_pay as restrictive for update to authenticated using ((select public.app_actor_role()) is not null and ((select public.app_actor_role()) in ('exec','admin'))) with check ((select public.app_actor_role()) is not null and ((select public.app_actor_role()) in ('exec','admin')));

create policy role_v831_delete on public.hr_pay as restrictive for delete to authenticated using ((select public.app_actor_role()) is not null and ((select public.app_actor_role()) in ('exec','admin')));

create policy role_v831_select on public.payslips as restrictive for select to authenticated using ((select public.app_actor_role()) is not null and ((user_id=auth.uid() or (select public.app_actor_role()) in ('exec','admin','hr') or ((select public.app_actor_role())='finance' and status='paid'))));

create policy role_v831_insert on public.payslips as restrictive for insert to authenticated with check ((select public.app_actor_role()) is not null and (((select public.app_actor_role()) in ('exec','admin') or ((select public.app_actor_role())='hr' and user_id<>auth.uid() and status='draft'))));

create policy role_v831_update on public.payslips as restrictive for update to authenticated using ((select public.app_actor_role()) is not null and (((select public.app_actor_role()) in ('exec','admin') or ((select public.app_actor_role())='hr' and user_id<>auth.uid() and status='draft')))) with check ((select public.app_actor_role()) is not null and (((select public.app_actor_role()) in ('exec','admin') or ((select public.app_actor_role())='hr' and user_id<>auth.uid() and status='draft'))));

create policy role_v831_delete on public.payslips as restrictive for delete to authenticated using ((select public.app_actor_role()) is not null and (((select public.app_actor_role()) in ('exec','admin') or ((select public.app_actor_role())='hr' and user_id<>auth.uid() and status='draft'))));

create policy role_v831_select on public.profiles as restrictive for select to authenticated using ((select public.app_actor_role()) is not null and ((id=auth.uid() or (select public.app_actor_role()) in ('exec','admin') or (select public.app_actor_role())='hr')));

create policy role_v831_insert on public.profiles as restrictive for insert to authenticated with check ((select public.app_actor_role()) is not null and ((select public.app_actor_role())='exec'));

create policy role_v831_update on public.profiles as restrictive for update to authenticated using ((select public.app_actor_role()) is not null and ((id=auth.uid() or (select public.app_actor_role()) in ('exec','admin') or (select public.app_actor_role())='hr'))) with check ((select public.app_actor_role()) is not null and ((id=auth.uid() or (select public.app_actor_role()) in ('exec','admin') or (select public.app_actor_role())='hr')));

create policy role_v831_delete on public.profiles as restrictive for delete to authenticated using ((select public.app_actor_role()) is not null and ((select public.app_actor_role())='exec'));

create policy role_v831_hr_settings on public.app_config for all to authenticated using (key='hr_settings' and public.app_actor_role()='hr') with check (key='hr_settings' and public.app_actor_role()='hr');

-- Monetary approvals and payroll closure must never follow from menu edit rights.
create or replace function public.role_hr_action_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare r text:=public.app_actor_role(); n jsonb:=to_jsonb(new); o jsonb:=to_jsonb(old); begin
 if auth.uid() is null and coalesce(auth.role(),'') <> 'authenticated' then return coalesce(new,old); end if;
 if r in ('exec','admin') then return coalesce(new,old); end if;
 if r is null then raise exception 'ไม่มีสิทธิ์ใช้งาน' using errcode='42501'; end if;
 if tg_table_name='hr_pay' then raise exception 'ผู้บริหาร/ผู้จัดการเป็นผู้เปลี่ยนค่าจ้าง' using errcode='42501'; end if;
 if tg_table_name='payslips' then
  if r<>'hr' or coalesce(n->>'user_id',o->>'user_id')=auth.uid()::text or coalesce(n->>'status',o->>'status')<>'draft' or (tg_op<>'INSERT' and o->>'status'<>'draft') then raise exception 'HR เตรียมฉบับร่างของผู้อื่นได้ ผู้บริหาร/ผู้จัดการอนุมัติปิดรอบ' using errcode='42501'; end if;
 elsif tg_table_name in ('hr_leaves','hr_ot','hr_advances') then
  if tg_op='INSERT' and coalesce(n->>'status','pending')<>'pending' then raise exception 'ส่งเป็นรออนุมัติก่อน' using errcode='42501'; end if;
  if tg_op='UPDATE' and n->>'status' is distinct from o->>'status' then raise exception 'ผู้บริหาร/ผู้จัดการอนุมัติรายการ' using errcode='42501'; end if;
  if tg_table_name='hr_advances' then
   if r='finance' then
    if o->>'status'<>'approved' or o->>'user_id'=auth.uid()::text or (n-array['paid_out_at','paid_from','pay_slip_url']) is distinct from (o-array['paid_out_at','paid_from','pay_slip_url']) then raise exception 'การเงินจ่ายเฉพาะรายการอนุมัติของผู้อื่น' using errcode='42501'; end if;
   elsif tg_op='INSERT' and (n->>'paid_out_at' is not null or n->>'paid_from' is not null) or tg_op='UPDATE' and (n->>'paid_out_at' is distinct from o->>'paid_out_at' or n->>'paid_from' is distinct from o->>'paid_from') then raise exception 'ไม่มีอำนาจจ่ายเงินล่วงหน้า' using errcode='42501'; end if;
  end if;
  if tg_op='DELETE' and o->>'status'<>'pending' then raise exception 'ลบได้เฉพาะคำขอรออนุมัติ' using errcode='42501'; end if;
  if tg_op='UPDATE' and o->>'status'<>'pending' and r<>'finance' then
   -- Employees may check out their approved OT; they cannot rewrite its date/rate/owner.
   if tg_table_name<>'hr_ot' or (n-array['hours','time_to']) is distinct from (o-array['hours','time_to']) then raise exception 'รายการอนุมัติแล้วต้องให้ผู้จัดการแก้ไข' using errcode='42501'; end if;
  end if;
 elsif tg_table_name='hr_loans' then
  if tg_op='INSERT' and n->>'status'<>'pending' or tg_op<>'INSERT' and o->>'status'<>'pending' or tg_op='UPDATE' and n->>'status'<>'pending' then raise exception 'HR เตรียมเงินยืมรอผู้บริหาร/ผู้จัดการอนุมัติ' using errcode='42501'; end if;

 end if;
 return coalesce(new,old);
end $$;

create trigger role_hr_action_v831 before insert or update or delete on public.hr_pay for each row execute function public.role_hr_action_guard();

create trigger role_hr_action_v831 before insert or update or delete on public.payslips for each row execute function public.role_hr_action_guard();

create trigger role_hr_action_v831 before insert or update or delete on public.hr_leaves for each row execute function public.role_hr_action_guard();

create trigger role_hr_action_v831 before insert or update or delete on public.hr_ot for each row execute function public.role_hr_action_guard();

create trigger role_hr_action_v831 before insert or update or delete on public.hr_advances for each row execute function public.role_hr_action_guard();

create trigger role_hr_action_v831 before insert or update or delete on public.hr_loans for each row execute function public.role_hr_action_guard();

alter table public.hr_loans drop constraint hr_loans_status_check; alter table public.hr_loans add constraint hr_loans_status_check check(status in ('pending','active','closed'));

CREATE OR REPLACE FUNCTION public.hr_att_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if public.app_actor_role() in ('exec','admin') then return new; end if;
  if public.app_actor_role()='hr' and new.user_id<>auth.uid() then
    if tg_op='INSERT' then new.ot_ok:=null; new.hol_ok:=null; else new.ot_ok:=old.ot_ok; new.hol_ok:=old.hol_ok; end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    new.user_id:=old.user_id; new.work_date:=old.work_date; new.hol_ok:=old.hol_ok;
  else new.hol_ok:=null; end if;
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
    where my_role() in ('tech','lead_tech','admin','exec','finance','sales','stock')
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

revoke all on function public.jobs_for_team(p_team text) from public,anon; grant execute on function public.jobs_for_team(p_team text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_visit_status(p_visit_id bigint, p_status text, p_job_override text DEFAULT NULL::text, p_lock boolean DEFAULT NULL::boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_job text; v_team text; v_cur text; v_jstatus text; v_locked boolean;
begin
 if public.app_actor_role() is null or public.app_actor_role()='hr' then raise exception 'ไม่มีสิทธิ์เข้าถึงงาน' using errcode='42501'; end if;
  select job_no, assigned_team, status into v_job, v_team, v_cur from job_visits where id = p_visit_id;
  if v_job is null then raise exception 'visit not found'; end if;
  if not (my_role() in ('admin','sales','exec','finance','stock')
          or (my_role() in ('tech','lead_tech') and v_team = my_team())) then
    raise exception 'not allowed';
  end if;
  select status, coalesce(locked, false) into v_jstatus, v_locked from job_orders where job_no = v_job;
  if v_jstatus = 'cancelled' then raise exception 'ใบงานถูกยกเลิกแล้ว — เปลี่ยนสถานะรอบไม่ได้ (รีเฟรชหน้าจอ)'; end if;
  if my_role() in ('tech','lead_tech') then
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

revoke all on function public.set_visit_status(p_visit_id bigint, p_status text, p_job_override text, p_lock boolean) from public,anon; grant execute on function public.set_visit_status(p_visit_id bigint, p_status text, p_job_override text, p_lock boolean) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_job_visits_status(p_job text, p_from text[], p_to text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if public.app_actor_role() is null or public.app_actor_role()='hr' then raise exception 'ไม่มีสิทธิ์เข้าถึงงาน' using errcode='42501'; end if;
  if not (my_role() in ('admin','sales','exec','finance','stock')) then
    raise exception 'not allowed';
  end if;
  if p_to <> 'cancelled' and (select status from job_orders where job_no = p_job) = 'cancelled' then
    raise exception 'ใบงานถูกยกเลิกแล้ว';
  end if;
  update job_visits set status = p_to where job_no = p_job and status = any(p_from);
  return recompute_job_status(p_job);
end $function$
;

revoke all on function public.set_job_visits_status(p_job text, p_from text[], p_to text) from public,anon; grant execute on function public.set_job_visits_status(p_job text, p_from text[], p_to text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_job_status(p_job text, p_status text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cur text; v_locked boolean; v_team text;
begin
 if public.app_actor_role() is null or public.app_actor_role()='hr' then raise exception 'ไม่มีสิทธิ์เข้าถึงงาน' using errcode='42501'; end if;
  select status, coalesce(locked, false), assigned_team into v_cur, v_locked, v_team from job_orders where job_no = p_job;
  if v_cur is null then raise exception 'job not found'; end if;
  if my_role() in ('admin','sales','exec','finance','stock') then
    null;  -- ออฟฟิศ/หัวหน้าช่าง เปลี่ยนได้ทุกสถานะ (รวมยกเลิก/คืนชีพ)
  elsif my_role() in ('tech','lead_tech') then
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

revoke all on function public.set_job_status(p_job text, p_status text) from public,anon; grant execute on function public.set_job_status(p_job text, p_status text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.sub_pending_for_team()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with me as (select my_team() as team),
guard as (
  select m.team from me m
  join teams t on t.id = m.team and t.type = 'sub' and public.app_actor_role() in ('exec','admin','lead_tech','tech','assistant')
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

revoke all on function public.sub_pending_for_team() from public,anon; grant execute on function public.sub_pending_for_team() to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.kpi_scorecard(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with allow as (select my_role() in ('admin','exec','finance') as ok),
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

revoke all on function public.kpi_scorecard(p_from date, p_to date) from public,anon; grant execute on function public.kpi_scorecard(p_from date, p_to date) to authenticated,service_role;

alter view public.material_stock set (security_invoker=true); revoke all on public.material_stock from anon;

insert into storage.buckets(id,name,public) values('hr-documents','hr-documents',false) on conflict(id) do update set public=false;
create policy hr_docs_read_v831 on storage.objects for select to authenticated using (bucket_id='hr-documents' and (public.app_actor_role() in ('exec','admin','hr') or (storage.foldername(name))[1]=auth.uid()::text));
create policy hr_docs_write_v831 on storage.objects for insert to authenticated with check(bucket_id='hr-documents' and public.app_actor_role() in ('exec','admin','hr'));
-- Restrictive policy also fences any older permissive storage policy.
create policy hr_docs_fence_v831 on storage.objects as restrictive for all to authenticated
using(bucket_id<>'hr-documents' or (public.app_actor_role() is not null and (public.app_actor_role() in ('exec','admin','hr') or (storage.foldername(name))[1]=auth.uid()::text)))
with check(bucket_id<>'hr-documents' or public.app_actor_role() in ('exec','admin','hr'));

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
    and (requester = auth.uid() or my_role() in ('admin','exec','finance'));
  if not found then
    raise exception 'ไม่พบคำขอเบิก หรือไม่มีสิทธิ์แนบใบเสร็จรายการนี้';
  end if;
end $function$
;

revoke all on function public.expense_attach_receipt(p_id uuid, p_urls text[]) from public,anon; grant execute on function public.expense_attach_receipt(p_id uuid, p_urls text[]) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.line_bump_unread(p_uid text, p_msg text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update line_contacts set unread = unread + 1, last_message = p_msg, last_message_at = now()
  where line_user_id = p_uid and (public.app_can('chat',true) or auth.role()='service_role');
$function$
;

revoke all on function public.line_bump_unread(p_uid text, p_msg text) from public,anon; grant execute on function public.line_bump_unread(p_uid text, p_msg text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.recompute_job_status(p_job text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text;
begin
 if auth.role() is distinct from 'service_role' and not (public.app_can('joborders',true) or public.app_actor_role() in ('lead_tech','tech','assistant')) then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
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

revoke all on function public.recompute_job_status(p_job text) from public,anon; grant execute on function public.recompute_job_status(p_job text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.claim_receipt_flowaccount(p_receipt_no text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare claimed int;
begin
 if auth.role() is distinct from 'service_role' and not public.app_can('accounting',true) then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  update receipts set flowaccount_at = now()
   where receipt_no = p_receipt_no
     and flowaccount_id is null
     and flowaccount_at is null;
  get diagnostics claimed = row_count;
  return claimed > 0;
end; $function$
;

revoke all on function public.claim_receipt_flowaccount(p_receipt_no text) from public,anon; grant execute on function public.claim_receipt_flowaccount(p_receipt_no text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.release_receipt_flowaccount(p_receipt_no text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if auth.role() is distinct from 'service_role' and not public.app_can('accounting',true) then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  update receipts set flowaccount_at = null
   where receipt_no = p_receipt_no and flowaccount_id is null;
end; $function$
;

revoke all on function public.release_receipt_flowaccount(p_receipt_no text) from public,anon; grant execute on function public.release_receipt_flowaccount(p_receipt_no text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare done int;
begin
 if auth.role() is distinct from 'service_role' and not public.app_can('accounting',true) then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
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

revoke all on function public.set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text) from public,anon; grant execute on function public.set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text) to authenticated,service_role;

update public.app_config set value=value || '{"exec": {"marketing": "edit", "promo": "edit", "accounting": "edit", "dashboard": "edit", "kpi": "edit", "saleshub": "edit", "customers": "edit", "pipeline": "edit", "reviews": "edit", "followup": "edit", "weborders": "edit", "website": "edit", "chat": "edit", "email": "edit", "teamchat": "edit", "tasks": "edit", "attendance": "edit", "hr": "edit", "boq": "edit", "quote": "edit", "invoice": "edit", "recvcenter": "edit", "receipt": "edit", "adjnote": "edit", "billing": "edit", "receivables": "edit", "payables": "edit", "tax": "edit", "profit": "edit", "cashflow": "edit", "loans": "edit", "recurring": "edit", "assets": "edit", "expenses": "edit", "paycenter": "edit", "myjobs": "edit", "joborders": "edit", "handover": "edit", "schedule": "edit", "catalog": "edit", "movements": "edit", "stockcount": "edit", "jobs": "edit", "subcontract": "edit", "suppliers": "edit", "prep": "edit", "po": "edit", "tools": "edit", "handbook": "edit", "settings": "edit"}, "admin": {"marketing": "edit", "promo": "edit", "accounting": "edit", "dashboard": "edit", "kpi": "edit", "saleshub": "edit", "customers": "edit", "pipeline": "edit", "reviews": "edit", "followup": "edit", "weborders": "edit", "website": "edit", "chat": "edit", "email": "edit", "teamchat": "edit", "tasks": "edit", "attendance": "edit", "hr": "edit", "boq": "edit", "quote": "edit", "invoice": "edit", "recvcenter": "edit", "receipt": "edit", "adjnote": "edit", "billing": "edit", "receivables": "edit", "payables": "edit", "tax": "edit", "profit": "edit", "cashflow": "edit", "loans": "edit", "recurring": "edit", "assets": "edit", "expenses": "edit", "paycenter": "edit", "myjobs": "edit", "joborders": "edit", "handover": "edit", "schedule": "edit", "catalog": "edit", "movements": "edit", "stockcount": "edit", "jobs": "edit", "subcontract": "edit", "suppliers": "edit", "prep": "edit", "po": "edit", "tools": "edit", "handbook": "edit", "settings": "edit"}, "hr": {"teamchat": "edit", "tasks": "edit", "attendance": "edit", "handbook": "view", "hr": "edit", "expenses": "edit", "paycenter": "edit"}}'::jsonb,updated_at=now() where key='role_permissions';

alter policy txn_admin_delete on public.transactions using ((my_role() in ('admin','exec')));

alter policy prof_admin_insert on public.profiles with check ((my_role() in ('admin','exec')));

alter policy prof_admin_write on public.profiles using ((my_role() in ('admin','exec'))) with check ((my_role() in ('admin','exec')));

alter policy inv_write_del on public.invoices using ((my_role() in ('admin','exec')));

alter policy rc_write_del on public.receipts using ((my_role() in ('admin','exec')));

alter policy boq_write_del on public.boqs using ((my_role() in ('admin','exec')));

alter policy qt_write_del on public.quotations using ((my_role() in ('admin','exec')));

alter policy team_write on public.teams using ((my_role() in ('admin','exec'))) with check ((my_role() in ('admin','exec')));

alter policy bn_write_del on public.billing_notes using ((my_role() in ('admin','exec')));

alter policy job_handovers_del on public.job_handovers using (((my_role() in ('admin','exec')) OR ((created_by = auth.uid()) AND (status = 'draft'::text))));

create policy role_v831_hr_only on public.customers as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.customer_contacts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.customer_sites as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.customer_followups as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.boqs as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.boq_items as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.quotations as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.quotation_items as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.invoices as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.billing_notes as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.receipts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.adjustment_notes as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.accounts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.account_entries as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.cash_entries as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.loans as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.recurring_bills as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.fixed_assets as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.acc_accounts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.acc_entities as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.acc_journal as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.acc_journal_lines as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.acc_periods as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.materials as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.categories as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.brands as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.btus as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.purchase_orders as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.po_items as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.material_preps as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.material_prep_items as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.suppliers as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.supplier_contacts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.supplier_sites as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.transactions as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.stock_counts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.stock_count_items as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.tools as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.tool_types as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.tool_moves as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.jobs as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.job_logs as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.job_handovers as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.job_orders as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.job_visits as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.job_order_templates as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.calendar_events as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.sub_payouts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.line_contacts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.line_contact_customers as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.line_messages as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.fb_contacts as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.fb_messages as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.fb_comments as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.quick_replies as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.email_messages as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.email_threads as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.chat_notes as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.web_orders as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.web_clients as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.promo_campaigns as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.promo_coupons as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_only on public.service_reminders as restrictive for all to authenticated using(coalesce((select public.app_actor_role()),'hr')<>'hr') with check(coalesce((select public.app_actor_role()),'hr')<>'hr');

create policy role_v831_hr_expenses on public.expense_requests as restrictive for all to authenticated using((select public.app_actor_role())<>'hr' or requester=auth.uid()) with check((select public.app_actor_role())<>'hr' or (requester=auth.uid() and status='pending'));

create policy role_v831_hr_notifications on public.notifications as restrictive for select to authenticated using((select public.app_actor_role())<>'hr' or category in ('hr','team_chat','task','tasks','system') or url in ('attendance','hr','teamchat','tasks','handbook'));

create policy role_v831_hr_attendance_delete on public.hr_attendance as restrictive for delete to authenticated using((select public.app_actor_role())<>'hr' or user_id<>auth.uid());

create policy role_v831_hr_task_scope on public.tasks as restrictive for all to authenticated using((select public.app_actor_role())<>'hr' or ((assigner=auth.uid() or assignee=auth.uid()) and customer_id is null and job_no is null)) with check((select public.app_actor_role())<>'hr' or ((assigner=auth.uid() or assignee=auth.uid()) and customer_id is null and job_no is null));

create policy role_v831_hr_team_finance on public.teams as restrictive for select to authenticated using((select public.app_actor_role())<>'hr');

create policy role_v831_internal_anon on public.loans as restrictive for all to anon using(false) with check(false);

create policy role_v831_internal_anon on public.adjustment_notes as restrictive for all to anon using(false) with check(false);

create policy role_v831_internal_anon on public.recurring_bills as restrictive for all to anon using(false) with check(false);

create policy role_v831_internal_anon on public.fixed_assets as restrictive for all to anon using(false) with check(false);

create policy role_v831_internal_anon on public.customer_followups as restrictive for all to anon using(false) with check(false);

create policy role_v831_internal_anon on public.hr_leave_quota as restrictive for all to anon using(false) with check(false);

create policy role_v831_hr_config_read on public.app_config as restrictive for select to authenticated using((select public.app_actor_role())<>'hr' or key in ('role_permissions','hr_settings','notify_settings'));

do $$ begin if (select value-array['exec','admin','hr'] from public.app_config where key='role_permissions') is distinct from '{"assistant": {"adjnote": "none", "attendance": "edit", "billing": "none", "boq": "none", "cashflow": "none", "catalog": "none", "chat": "none", "customers": "none", "dashboard": "none", "expenses": "edit", "followup": "none", "handbook": "view", "handover": "edit", "hr": "none", "invoice": "none", "joborders": "none", "jobs": "none", "movements": "edit", "myjobs": "edit", "payables": "none", "paycenter": "edit", "po": "none", "prep": "none", "profit": "none", "quote": "none", "receipt": "none", "receivables": "none", "schedule": "view", "settings": "none", "subcontract": "none", "suppliers": "none", "tasks": "edit", "tax": "none", "teamchat": "edit", "tools": "view", "weborders": "none", "website": "none"}, "field_sales": {"adjnote": "edit", "attendance": "edit", "billing": "edit", "boq": "edit", "cashflow": "edit", "catalog": "edit", "chat": "edit", "customers": "edit", "dashboard": "view", "email": "edit", "expenses": "edit", "followup": "view", "handbook": "view", "handover": "edit", "hr": "none", "invoice": "edit", "joborders": "edit", "jobs": "edit", "marketing": "edit", "movements": "edit", "myjobs": "none", "payables": "none", "paycenter": "edit", "pipeline": "edit", "po": "edit", "prep": "edit", "profit": "view", "promo": "edit", "quote": "edit", "receipt": "edit", "receivables": "view", "recvcenter": "edit", "reviews": "edit", "saleshub": "edit", "schedule": "edit", "settings": "none", "subcontract": "edit", "suppliers": "none", "tasks": "edit", "tax": "none", "teamchat": "edit", "tools": "view", "weborders": "view", "website": "edit"}, "finance": {"accounting": "edit", "adjnote": "edit", "assets": "edit", "attendance": "edit", "billing": "edit", "boq": "view", "cashflow": "edit", "catalog": "edit", "chat": "edit", "customers": "edit", "dashboard": "view", "email": "edit", "expenses": "edit", "followup": "none", "handbook": "view", "handover": "view", "hr": "edit", "invoice": "edit", "joborders": "view", "jobs": "edit", "kpi": "view", "loans": "edit", "movements": "edit", "myjobs": "none", "payables": "view", "paycenter": "edit", "pipeline": "view", "po": "edit", "prep": "edit", "profit": "view", "quote": "view", "receipt": "edit", "receivables": "view", "recurring": "edit", "recvcenter": "edit", "saleshub": "edit", "schedule": "view", "settings": "view", "stockcount": "view", "subcontract": "edit", "suppliers": "edit", "tasks": "edit", "tax": "view", "teamchat": "edit", "tools": "view", "weborders": "view", "website": "none"}, "graphic": {"adjnote": "none", "attendance": "edit", "billing": "none", "boq": "none", "cashflow": "none", "catalog": "view", "chat": "none", "customers": "none", "dashboard": "none", "expenses": "edit", "followup": "none", "handbook": "view", "handover": "none", "hr": "none", "invoice": "none", "joborders": "view", "jobs": "none", "marketing": "edit", "movements": "none", "myjobs": "none", "payables": "none", "paycenter": "edit", "po": "none", "prep": "none", "profit": "none", "quote": "none", "receipt": "none", "receivables": "none", "reviews": "edit", "schedule": "none", "settings": "none", "subcontract": "none", "suppliers": "none", "tasks": "edit", "tax": "none", "teamchat": "edit", "tools": "none", "weborders": "view", "website": "edit"}, "lead_tech": {"adjnote": "none", "attendance": "edit", "billing": "none", "boq": "none", "cashflow": "none", "catalog": "view", "chat": "none", "customers": "none", "dashboard": "none", "expenses": "edit", "followup": "none", "handbook": "view", "handover": "edit", "hr": "none", "invoice": "none", "joborders": "edit", "jobs": "view", "movements": "edit", "myjobs": "edit", "payables": "none", "paycenter": "edit", "po": "none", "prep": "none", "profit": "none", "quote": "none", "receipt": "none", "receivables": "none", "schedule": "edit", "settings": "none", "subcontract": "none", "suppliers": "none", "tasks": "edit", "tax": "none", "teamchat": "edit", "tools": "view", "weborders": "none", "website": "none"}, "maid": {"adjnote": "none", "attendance": "edit", "billing": "none", "boq": "none", "cashflow": "none", "catalog": "none", "chat": "none", "customers": "none", "dashboard": "none", "expenses": "edit", "followup": "none", "handbook": "view", "handover": "none", "hr": "none", "invoice": "none", "joborders": "none", "jobs": "none", "movements": "none", "myjobs": "none", "payables": "none", "paycenter": "edit", "po": "none", "prep": "none", "profit": "none", "quote": "none", "receipt": "none", "receivables": "none", "schedule": "none", "settings": "none", "subcontract": "none", "suppliers": "none", "tasks": "edit", "tax": "none", "teamchat": "edit", "tools": "none", "weborders": "none", "website": "none"}, "sales": {"adjnote": "edit", "attendance": "edit", "billing": "edit", "boq": "edit", "cashflow": "edit", "catalog": "edit", "chat": "edit", "customers": "edit", "dashboard": "view", "email": "edit", "expenses": "edit", "followup": "view", "handbook": "view", "handover": "edit", "hr": "none", "invoice": "edit", "joborders": "edit", "jobs": "edit", "marketing": "edit", "movements": "edit", "myjobs": "none", "payables": "none", "paycenter": "edit", "pipeline": "edit", "po": "edit", "prep": "edit", "profit": "view", "promo": "edit", "quote": "edit", "receipt": "edit", "receivables": "view", "recvcenter": "edit", "reviews": "edit", "saleshub": "edit", "schedule": "edit", "settings": "none", "subcontract": "edit", "suppliers": "edit", "tasks": "edit", "tax": "view", "teamchat": "edit", "tools": "view", "weborders": "view", "website": "none"}, "stock": {"adjnote": "none", "attendance": "edit", "billing": "none", "boq": "none", "cashflow": "none", "catalog": "edit", "chat": "none", "customers": "none", "dashboard": "none", "expenses": "edit", "followup": "none", "handbook": "view", "handover": "edit", "hr": "none", "invoice": "none", "joborders": "view", "jobs": "edit", "movements": "edit", "myjobs": "view", "payables": "none", "paycenter": "edit", "po": "edit", "prep": "edit", "profit": "none", "quote": "none", "receipt": "none", "receivables": "none", "schedule": "view", "settings": "none", "stockcount": "edit", "subcontract": "none", "suppliers": "edit", "tasks": "edit", "tax": "none", "teamchat": "edit", "tools": "edit", "weborders": "none", "website": "none"}, "tech": {"adjnote": "none", "attendance": "edit", "billing": "none", "boq": "none", "cashflow": "none", "catalog": "none", "chat": "none", "customers": "none", "dashboard": "none", "expenses": "edit", "followup": "none", "handbook": "view", "handover": "edit", "hr": "none", "invoice": "none", "joborders": "none", "jobs": "none", "movements": "edit", "myjobs": "edit", "payables": "none", "paycenter": "edit", "po": "none", "prep": "none", "profit": "none", "quote": "none", "receipt": "none", "receivables": "none", "schedule": "view", "settings": "none", "subcontract": "none", "suppliers": "none", "tasks": "edit", "tax": "none", "teamchat": "edit", "tools": "view", "weborders": "none", "website": "none"}}'::jsonb then raise exception 'Other role settings changed unexpectedly'; end if; end $$;
