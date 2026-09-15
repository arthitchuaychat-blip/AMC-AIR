-- Finance can read payroll; editing and approvals retain the existing guards.
-- No changes to attendance, HR profiles, personal documents or employee self-service.
CREATE OR REPLACE FUNCTION public.app_can(p_module text, p_write boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare r text := public.app_actor_role(); v text; begin
 if r is null then return false; end if;
 if p_module = 'permissions' then return r = 'exec'; end if;
 if r in ('exec','admin') then return true; end if;
 if p_module = 'attendance' then return true; end if;
 if r = 'hr' and p_module not in ('teamchat','tasks','attendance','handbook','hr','expenses','paycenter') then return false; end if;
 if p_module = 'hr' and r not in ('hr','finance') then return false; end if;
 if p_module = 'hr' and r = 'finance' and p_write then return false; end if;
 select value->r->>p_module into v from public.app_config where key='role_permissions';
 return coalesce(case when p_write then v='edit' else v in ('edit','view') end,false);
end $function$
;
alter policy role_v831_select on public.hr_pay using (
  (select public.app_actor_role()) is not null and (
    user_id = (select auth.uid()) or (select public.app_actor_role()) in ('exec','admin','hr')
    or ((select public.app_actor_role()) = 'finance' and (select public.app_can('hr',false)))
  )
);
alter policy role_v831_select on public.payslips using (
  (select public.app_actor_role()) is not null and (
    user_id = (select auth.uid()) or (select public.app_actor_role()) in ('exec','admin','hr')
    or ((select public.app_actor_role()) = 'finance' and (status = 'paid' or (select public.app_can('hr',false))))
  )
);

-- One monthly snapshot; SECURITY INVOKER keeps table RLS in force.
create or replace function public.finance_payroll_report(p_period text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or public.app_actor_role() not in ('exec','admin','hr','finance')
     or public.app_actor_role() is null or not public.app_can('hr',false) then
    raise exception 'ไม่มีสิทธิ์ดูรายงานเงินเดือน' using errcode='42501';
  end if;
  if p_period is null or p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'กรุณาระบุเดือน YYYY-MM' using errcode='22023';
  end if;
  with slips as materialized (
    select s.user_id, s.period, s.pay_type, s.status, s.base, s.ot_pay, s.hol_pay,
      s.bonus, s.other_note, s.other_deduct, s.d_late, s.d_absent, s.d_leave,
      s.d_sso, s.d_tax, s.d_advance, s.d_loan, s.d_water, s.d_electric, s.net,
      s.present_days, s.absent_days, s.leave_days, s.over_leave_days,
      s.late_min, s.ot_min, s.updated_at
    from public.payslips s where s.period = p_period
  ), staff as (
    select d.id, d.name, d.department, d.role, d.active,
      p.pay_type, p.base_pay, p.user_id is not null as has_pay_rate
    from public.staff_directory d
    left join public.hr_pay p on p.user_id = d.id
    left join public.team_directory t on t.id = d.team
    where (d.active is distinct from false and coalesce(t.type,'') <> 'sub')
       or exists(select 1 from slips s where s.user_id = d.id)
  )
  select jsonb_build_object('period',p_period,
    'employees',coalesce((select jsonb_agg(to_jsonb(d) order by d.name,d.id) from staff d),'[]'::jsonb),
    'slips',coalesce((select jsonb_agg(to_jsonb(s) order by s.user_id) from slips s),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.finance_payroll_report(text) from public, anon;
grant execute on function public.finance_payroll_report(text) to authenticated, service_role;

-- Owner requested access for the finance role. Preserve every other setting.
update public.app_config
set value = jsonb_set(value, '{finance}',
  coalesce(value->'finance','{}'::jsonb) || '{"hr":"view"}'::jsonb, true)
where key = 'role_permissions';
notify pgrst, 'reload schema';
