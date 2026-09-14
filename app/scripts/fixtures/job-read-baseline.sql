-- Local test fixture: column types, read policies and job RPC definitions captured
-- from production on 2026-09-14. No production rows, credentials or user identities.
-- Unrelated constraints/triggers are intentionally outside this read-boundary fixture.
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
create table public."app_config"("key" text,"value" jsonb,"updated_at" timestamp with time zone);
alter table public."app_config" enable row level security;
create table public."boq_items"("id" bigint,"boq_no" text,"section" text,"item_code" text,"name" text,"unit" text,"qty" numeric,"unit_cost" numeric,"description" text);
alter table public."boq_items" enable row level security;
create table public."boqs"("boq_no" text,"customer_id" bigint,"site_id" bigint,"title" text,"note" text,"status" text,"created_at" timestamp with time zone,"created_by" uuid,"terms_payment" text,"terms_freebies" text,"terms_warranty" text,"internal_note" text,"sign_url" text,"sign_name" text,"issue_date" date,"job_type" text);
alter table public."boqs" enable row level security;
create table public."customer_contacts"("id" bigint,"customer_id" bigint,"name" text,"phone" text,"role" text);
alter table public."customer_contacts" enable row level security;
create table public."customer_sites"("id" bigint,"customer_id" bigint,"site_name" text,"address" text,"map_url" text,"contact_name" text,"phone" text);
alter table public."customer_sites" enable row level security;
create table public."customers"("id" bigint,"type" text,"name" text,"address" text,"tax_id" text,"vat" boolean,"note" text,"created_at" timestamp with time zone,"created_by" uuid,"email" text,"credit_days" integer,"source" text,"stage" text,"owner_id" uuid,"next_followup" date,"est_value" numeric,"lost_reason" text,"branch" text,"first_service_at" date,"last_service_at" date);
alter table public."customers" enable row level security;
create table public."invoices"("invoice_no" text,"quote_no" text,"boq_no" text,"customer_id" bigint,"site_id" bigint,"issue_date" date,"due_date" date,"installment" integer,"pct" numeric,"base" numeric,"vat_amt" numeric,"total" numeric,"wht_amt" numeric,"note" text,"status" text,"created_at" timestamp with time zone,"created_by" uuid,"items" jsonb,"wht_rate" numeric,"terms_payment" text,"terms_freebies" text,"terms_warranty" text,"internal_note" text,"sign_url" text,"sign_name" text,"bad_debt_at" timestamp with time zone,"bad_debt_reason" text,"wht_enabled" boolean);
alter table public."invoices" enable row level security;
create table public."job_logs"("id" bigint,"job_no" text,"type" text,"status" text,"note" text,"photos" text[],"author" text,"created_at" timestamp with time zone,"created_by" uuid,"parent_id" bigint);
alter table public."job_logs" enable row level security;
create table public."job_orders"("job_no" text,"quote_no" text,"customer_id" bigint,"site_id" bigint,"title" text,"contact_name" text,"contact_phone" text,"address" text,"map_url" text,"details" text,"assigned_team" text,"scheduled_at" timestamp with time zone,"status" text,"created_at" timestamp with time zone,"created_by" uuid,"completion_note" text,"photos" text[],"sales_note" text,"sales_photos" text[],"slot" text,"end_date" date,"job_type" text,"group_no" text,"labor_lines" jsonb,"labor_total" numeric,"labor_paid" boolean,"payout_id" uuid,"rating" integer,"is_claim" boolean,"labor_confirmed" boolean,"labor_confirmed_at" timestamp with time zone,"labor_confirmed_by" uuid,"labor_paid_amt" numeric,"internal_note" text,"locked" boolean,"issue_date" date,"rework_of" text,"cust_rating" integer,"cust_comment" text,"cust_rated_at" timestamp with time zone,"survey_job_no" text,"labor_mode" text,"labor_rate_config" jsonb,"labor_manual" boolean,"labor_review_required" boolean,"labor_calendar_days" integer);
alter table public."job_orders" enable row level security;
create table public."job_visits"("id" bigint,"job_no" text,"visit_date" date,"end_date" date,"slot" text,"scheduled_at" timestamp with time zone,"assigned_team" text,"status" text,"note" text,"created_at" timestamp with time zone,"created_by" uuid);
alter table public."job_visits" enable row level security;
create table public."jobs"("job_no" text,"team" text,"status" text,"used_value" numeric,"closed_at" timestamp with time zone,"closed_by" uuid,"created_at" timestamp with time zone);
alter table public."jobs" enable row level security;
create table public."profiles"("id" uuid,"email" text,"name" text,"role" text,"team" text,"hire_date" date,"department" text,"work_pattern" text,"sat_group" text,"pay_type" text,"base_pay" numeric,"ot_rate" numeric,"sso" boolean,"signature_url" text,"citizen_id" text,"avatar_url" text,"active" boolean);
alter table public."profiles" enable row level security;
create table public."purchase_orders"("po_no" text,"supplier" text,"status" text,"note" text,"created_at" timestamp with time zone,"received_at" timestamp with time zone,"created_by" uuid,"internal_note" text,"price_incl" boolean,"vat" boolean,"quote_no" text,"expense_id" uuid,"paid_at" timestamp with time zone,"prep_no" text,"issue_date" date,"po_type" text,"delivery_date" date,"delivery_method" text,"dn_no" text,"sup_inv_no" text,"attachments" jsonb);
alter table public."purchase_orders" enable row level security;
create table public."quotation_items"("id" bigint,"quote_no" text,"item_code" text,"name" text,"kind" text,"unit" text,"qty" numeric,"unit_price" numeric,"description" text,"discount" numeric);
alter table public."quotation_items" enable row level security;
create table public."quotations"("quote_no" text,"customer_id" bigint,"site_id" bigint,"boq_no" text,"title" text,"status" text,"issue_date" date,"valid_until" date,"discount_type" text,"discount_value" numeric,"vat" boolean,"note" text,"approved_at" timestamp with time zone,"created_at" timestamp with time zone,"created_by" uuid,"wht" boolean,"wht_rate" numeric,"terms_payment" text,"terms_freebies" text,"terms_warranty" text,"internal_note" text,"sign_url" text,"sign_name" text,"pay_method" text,"job_type" text,"variation_of" text);
alter table public."quotations" enable row level security;
create table public."receipts"("receipt_no" text,"invoice_no" text,"quote_no" text,"boq_no" text,"job_no" text,"customer_id" bigint,"site_id" bigint,"issue_date" date,"payment_method" text,"base" numeric,"vat_amt" numeric,"total" numeric,"wht_amt" numeric,"net" numeric,"note" text,"created_at" timestamp with time zone,"created_by" uuid,"status" text,"wht" boolean,"wht_rate" numeric,"items" jsonb,"terms_payment" text,"terms_freebies" text,"terms_warranty" text,"flowaccount_id" text,"flowaccount_no" text,"flowaccount_at" timestamp with time zone,"internal_note" text,"sign_url" text,"sign_name" text,"paid_on" date);
alter table public."receipts" enable row level security;
create table public."teams"("id" text,"name" text,"lead" text,"van" text,"color" text,"type" text,"phone" text,"tax_id" text,"bank_info" text,"payout_rate" numeric);
alter table public."teams" enable row level security;
grant usage on schema auth,public to authenticated,anon,service_role;
grant all on all tables in schema public to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.app_actor_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select role from public.profiles where id = auth.uid() and active is distinct from false $function$
;
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select case public.app_actor_role() when 'field_sales' then 'sales' when 'assistant' then 'tech' else coalesce(public.app_actor_role(),'none') end $function$
;
CREATE OR REPLACE FUNCTION public.my_team()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select team from public.profiles where id = auth.uid()
$function$
;
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
create view public.team_directory with (security_invoker=true) as select id,name from public.teams;
grant select on public.team_directory to authenticated;
CREATE OR REPLACE FUNCTION public.job_field_refs(p_job text DEFAULT NULL::text, p_group text DEFAULT NULL::text)
 RETURNS TABLE(job_no text, group_no text, customer_id bigint, customer_name text, assigned_team text, scheduled_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with actor as materialized (
    select public.app_actor_role() as actor_role, public.my_role() as role, public.my_team() as team
  )
  select jo.job_no, jo.group_no, jo.customer_id, c.name, jo.assigned_team, jo.scheduled_at
  from public.job_orders jo
  cross join actor a
  left join public.customers c on c.id = jo.customer_id
  where a.actor_role is not null and a.actor_role <> 'hr'
    and (p_job is null or jo.job_no = p_job)
    and (p_group is null or jo.group_no = p_group or jo.job_no = p_group)
    and (a.role <> 'tech' or (a.team is not null and (
      jo.assigned_team = a.team or exists (
        select 1 from public.job_visits v where v.job_no = jo.job_no and v.assigned_team = a.team
      )
    )))
  order by jo.job_no;
$function$
;
CREATE OR REPLACE FUNCTION public.job_order_bundle(p_nos text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 with j as materialized (
   select jo.* from public.job_orders jo
   -- Explicit office-role guard in addition to SECURITY INVOKER table RLS.
   -- These roles retain their existing job read access; tech/assistant/lead_tech,
   -- HR, inactive profiles and every other role receive no raw job data.
   where (select public.app_actor_role()) is not null
     and (select public.my_role()) in ('admin','exec','finance','sales','stock','graphic')
     and (p_nos is null or jo.job_no = any(p_nos))
 ), q as materialized (
   select quote_no,boq_no,discount_type,discount_value,vat,created_by
   from public.quotations where quote_no in (select quote_no from j)
 )
 select json_build_object(
   'jobs',coalesce((select json_agg(j order by created_at desc,job_no) from j),'[]'::json),
   'customers',coalesce((select json_agg(x order by id) from (
     select id,name,address from public.customers where id in(select customer_id from j)
   ) x),'[]'::json),
   'teams',coalesce((select json_agg(x) from(select id,name from public.team_directory)x),'[]'::json),
   'sites',coalesce((select json_agg(x order by id) from (
     select id,site_name,address,map_url,contact_name,phone from public.customer_sites where id in(select site_id from j)
   ) x),'[]'::json),
   'contacts',coalesce((select json_agg(x order by id) from (
     select id,customer_id,name,phone from public.customer_contacts where customer_id in(select customer_id from j)
   ) x),'[]'::json),
   'quotes',coalesce((select json_agg(q order by quote_no) from q),'[]'::json),
   'items',coalesce((select json_agg(x order by id) from (
     select id,quote_no,qty,unit_price,discount,kind,name,unit from public.quotation_items where quote_no in(select quote_no from j)
   ) x),'[]'::json),
   'visits',coalesce((select json_agg(v order by visit_date,id) from public.job_visits v where job_no in(select job_no from j)),'[]'::json),
   'creators',coalesce((select json_object_agg(id,name) from public.profiles
     where id in(select created_by from j union select created_by from q)),'{}'::json)
 );
$function$
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
create policy "app_config_read" on public."app_config" as PERMISSIVE for SELECT to authenticated using (true);
create policy "app_config_write" on public."app_config" as PERMISSIVE for ALL to authenticated using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text])));
create policy "role_v831_hr_config_read" on public."app_config" as RESTRICTIVE for SELECT to authenticated using (((( SELECT app_actor_role() AS app_actor_role) <> 'hr'::text) OR (key = ANY (ARRAY['role_permissions'::text, 'hr_settings'::text, 'notify_settings'::text]))));
create policy "role_v831_hr_settings" on public."app_config" as PERMISSIVE for ALL to authenticated using (((key = 'hr_settings'::text) AND (app_actor_role() = 'hr'::text))) with check (((key = 'hr_settings'::text) AND (app_actor_role() = 'hr'::text)));
create policy "boqi_read" on public."boq_items" as PERMISSIVE for SELECT to authenticated using ((( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'stock'::text, 'hr'::text])));
create policy "role_v831_hr_only" on public."boq_items" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "boq_read" on public."boqs" as PERMISSIVE for SELECT to authenticated using ((( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'stock'::text, 'hr'::text])));
create policy "role_v831_hr_only" on public."boqs" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "cc_read" on public."customer_contacts" as PERMISSIVE for SELECT to authenticated using (true);
create policy "cc_write" on public."customer_contacts" as PERMISSIVE for ALL to authenticated using ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text])));
create policy "role_v831_hr_only" on public."customer_contacts" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "cs_read" on public."customer_sites" as PERMISSIVE for SELECT to authenticated using (true);
create policy "cs_write" on public."customer_sites" as PERMISSIVE for ALL to authenticated using ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text])));
create policy "role_v831_hr_only" on public."customer_sites" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "cust_read" on public."customers" as PERMISSIVE for SELECT to authenticated using (true);
create policy "cust_write" on public."customers" as PERMISSIVE for ALL to authenticated using ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text])));
create policy "role_v831_hr_only" on public."customers" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "inv_read" on public."invoices" as PERMISSIVE for SELECT to authenticated using (true);
create policy "inv_write_sel" on public."invoices" as PERMISSIVE for SELECT to authenticated using (true);
create policy "role_v831_hr_only" on public."invoices" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "prof_read" on public."profiles" as PERMISSIVE for SELECT to authenticated using (true);
create policy "role_v831_select" on public."profiles" as RESTRICTIVE for SELECT to authenticated using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR (( SELECT app_actor_role() AS app_actor_role) = 'hr'::text))));
create policy "po_read" on public."purchase_orders" as PERMISSIVE for SELECT to authenticated using (true);
create policy "po_sel" on public."purchase_orders" as PERMISSIVE for SELECT to authenticated using ((( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'stock'::text, 'sales'::text, 'hr'::text])));
create policy "role_v831_hr_only" on public."purchase_orders" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "qti_read" on public."quotation_items" as PERMISSIVE for SELECT to authenticated using ((( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'stock'::text, 'hr'::text])));
create policy "role_v831_hr_only" on public."quotation_items" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "qt_read" on public."quotations" as PERMISSIVE for SELECT to authenticated using ((( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'stock'::text, 'hr'::text])));
create policy "role_v831_hr_only" on public."quotations" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "rc_read" on public."receipts" as PERMISSIVE for SELECT to authenticated using (true);
create policy "rc_write_sel" on public."receipts" as PERMISSIVE for SELECT to authenticated using (true);
create policy "role_v831_hr_only" on public."receipts" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "role_v831_hr_team_finance" on public."teams" as RESTRICTIVE for SELECT to authenticated using ((( SELECT app_actor_role() AS app_actor_role) <> 'hr'::text));
create policy "team_read" on public."teams" as PERMISSIVE for SELECT to authenticated using (true);
create policy "team_write" on public."teams" as PERMISSIVE for ALL to authenticated using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text])));
create policy "jl_insert" on public."job_logs" as PERMISSIVE for INSERT to authenticated with check ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'stock'::text, 'lead_tech'::text, 'tech'::text])));
create policy "jl_read" on public."job_logs" as PERMISSIVE for SELECT to authenticated using (true);
create policy "role_v831_hr_only" on public."job_logs" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "jo_read" on public."job_orders" as PERMISSIVE for SELECT to authenticated using (true);
create policy "jo_tech_update" on public."job_orders" as PERMISSIVE for UPDATE to authenticated using (((my_role() = 'tech'::text) AND (assigned_team = my_team()))) with check (((my_role() = 'tech'::text) AND (assigned_team = my_team())));
create policy "jo_write" on public."job_orders" as PERMISSIVE for ALL to authenticated using ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text, 'stock'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text, 'stock'::text])));
create policy "job_orders_field_read_boundary" on public."job_orders" as RESTRICTIVE for SELECT to authenticated using ((( SELECT my_role() AS my_role) <> ALL (ARRAY['tech'::text, 'lead_tech'::text])));
create policy "role_v831_hr_only" on public."job_orders" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "job_visits_field_read_boundary" on public."job_visits" as RESTRICTIVE for SELECT to authenticated using (((( SELECT my_role() AS my_role) <> 'tech'::text) OR (job_no IN ( SELECT r.job_no
   FROM job_field_refs() r(job_no, group_no, customer_id, customer_name, assigned_team, scheduled_at)))));
create policy "jv_lead_update" on public."job_visits" as PERMISSIVE for UPDATE to authenticated using ((my_role() = 'lead_tech'::text)) with check ((my_role() = 'lead_tech'::text));
create policy "jv_read" on public."job_visits" as PERMISSIVE for SELECT to authenticated using (true);
create policy "jv_tech_update" on public."job_visits" as PERMISSIVE for UPDATE to authenticated using (((my_role() = 'tech'::text) AND (assigned_team = my_team()))) with check (((my_role() = 'tech'::text) AND (assigned_team = my_team())));
create policy "jv_write" on public."job_visits" as PERMISSIVE for ALL to authenticated using ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text, 'stock'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text, 'stock'::text])));
create policy "role_v831_hr_only" on public."job_visits" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
create policy "jobs_read" on public."jobs" as PERMISSIVE for SELECT to authenticated using (true);
create policy "jobs_write" on public."jobs" as PERMISSIVE for ALL to authenticated using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'stock'::text, 'lead_tech'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'stock'::text, 'lead_tech'::text])));
create policy "role_v831_hr_only" on public."jobs" as RESTRICTIVE for ALL to authenticated using ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text)) with check ((COALESCE(( SELECT app_actor_role() AS app_actor_role), 'hr'::text) <> 'hr'::text));
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
    if (v_team = my_team()
            or exists (select 1 from job_visits where job_no = p_job and assigned_team = my_team())) is not true then
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
  if (my_role() in ('admin','sales','exec','finance','stock')
          or (my_role() in ('tech','lead_tech') and v_team = my_team())) is not true then
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

revoke all on function public.jobs_for_team(text),public.job_field_refs(text,text),public.job_order_bundle(text[]),public.set_job_status(text,text),public.set_visit_status(bigint,text,text,boolean) from public,anon;
grant execute on function public.jobs_for_team(text),public.job_field_refs(text,text),public.job_order_bundle(text[]),public.set_job_status(text,text),public.set_visit_status(bigint,text,text,boolean) to authenticated,service_role;
