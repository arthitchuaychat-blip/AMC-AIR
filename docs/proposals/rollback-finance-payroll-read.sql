-- Restores the read policy and role setting captured before this feature.
-- No payroll rows are changed.
drop function if exists public.finance_payroll_report(text);
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
 if p_module = 'hr' and r <> 'hr' then return false; end if;
 select value->r->>p_module into v from public.app_config where key='role_permissions';
 return coalesce(case when p_write then v='edit' else v in ('edit','view') end,false);
end $function$
;
alter policy role_v831_select on public.hr_pay using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((user_id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text, 'hr'::text])))));
alter policy role_v831_select on public.payslips using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((user_id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text, 'hr'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'finance'::text) AND (status = 'paid'::text)))));
update public.app_config set value=jsonb_set(value,'{finance}',coalesce(value->'finance','{}'::jsonb)||'{"hr":"edit"}'::jsonb,true) where key='role_permissions';
notify pgrst,'reload schema';
