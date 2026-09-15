-- Synthetic test schema using production column definitions, policies and guards.
-- Contains no employee data or credentials. Run only in disposable local PostgreSQL.
create role authenticated nologin;
create role anon nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated') $$;
create table public."app_config" ("key" text,"value" jsonb,"updated_at" timestamp with time zone);
alter table public."app_config" enable row level security;
create table public."hr_advances" ("id" uuid,"user_id" uuid,"amount" numeric,"reason" text,"request_date" date,"status" text,"period" text,"decided_by" uuid,"decided_at" timestamp with time zone,"decide_note" text,"created_by" uuid,"created_at" timestamp with time zone,"paid_out_at" timestamp with time zone,"paid_from" uuid,"pay_slip_url" text);
alter table public."hr_advances" enable row level security;
create table public."hr_attendance" ("id" uuid,"user_id" uuid,"work_date" date,"check_in_at" timestamp with time zone,"check_in_lat" double precision,"check_in_lng" double precision,"check_in_photo" text,"check_out_at" timestamp with time zone,"check_out_lat" double precision,"check_out_lng" double precision,"check_out_photo" text,"note" text,"created_at" timestamp with time zone,"ot_ok" boolean,"client_in_at" timestamp with time zone,"client_out_at" timestamp with time zone,"skew_sec" integer,"hol_ok" boolean);
alter table public."hr_attendance" enable row level security;
create table public."hr_leave_quota" ("user_id" uuid,"year" integer,"vacation" integer,"personal" integer,"sick" integer);
alter table public."hr_leave_quota" enable row level security;
create table public."hr_leaves" ("id" uuid,"user_id" uuid,"type" text,"start_date" date,"end_date" date,"days" numeric,"reason" text,"status" text,"decided_by" uuid,"decided_at" timestamp with time zone,"decide_note" text,"created_at" timestamp with time zone,"hours" numeric,"time_from" text,"time_to" text);
alter table public."hr_leaves" enable row level security;
create table public."hr_loans" ("id" bigint,"user_id" uuid,"principal" numeric,"installment" numeric,"balance" numeric,"status" text,"note" text,"created_by" uuid,"created_at" timestamp with time zone);
alter table public."hr_loans" enable row level security;
create table public."hr_ot" ("id" bigint,"user_id" uuid,"ot_date" date,"time_from" text,"time_to" text,"hours" numeric,"reason" text,"status" text,"period" text,"decided_by" uuid,"decided_at" timestamp with time zone,"decide_note" text,"created_by" uuid,"created_at" timestamp with time zone,"job_no" text);
alter table public."hr_ot" enable row level security;
create table public."hr_pay" ("user_id" uuid,"pay_type" text,"base_pay" numeric,"ot_rate" numeric,"sso" boolean,"citizen_id" text,"updated_at" timestamp with time zone,"tax_wht" numeric);
alter table public."hr_pay" enable row level security;
create table public."hr_profiles" ("user_id" uuid,"nickname" text,"phone" text,"address" text,"birth_date" date,"emergency_name" text,"emergency_phone" text,"bank_name" text,"bank_account" text,"position_title" text,"note" text,"documents" jsonb,"updated_at" timestamp with time zone);
alter table public."hr_profiles" enable row level security;
create table public."payslips" ("id" uuid,"period" text,"user_id" uuid,"pay_type" text,"base" numeric,"ot_pay" numeric,"present_days" numeric,"absent_days" numeric,"leave_days" numeric,"over_leave_days" numeric,"late_min" numeric,"ot_min" numeric,"d_late" numeric,"d_absent" numeric,"d_leave" numeric,"d_sso" numeric,"bonus" numeric,"other_deduct" numeric,"other_note" text,"net" numeric,"status" text,"paid_at" timestamp with time zone,"note" text,"created_by" uuid,"created_at" timestamp with time zone,"updated_at" timestamp with time zone,"d_advance" numeric,"paid_from" uuid,"pay_slip_url" text,"hol_pay" numeric,"d_tax" numeric,"d_loan" numeric,"d_water" numeric,"d_electric" numeric);
alter table public."payslips" enable row level security;
create table public."profiles" ("id" uuid,"email" text,"name" text,"role" text,"team" text,"hire_date" date,"department" text,"work_pattern" text,"sat_group" text,"pay_type" text,"base_pay" numeric,"ot_rate" numeric,"sso" boolean,"signature_url" text,"citizen_id" text,"avatar_url" text,"active" boolean);
alter table public."profiles" enable row level security;
create table public."teams" ("id" text,"name" text,"lead" text,"van" text,"color" text,"type" text,"phone" text,"tax_id" text,"bank_info" text,"payout_rate" numeric);
alter table public."teams" enable row level security;
alter table app_config add primary key(key);
alter table profiles add primary key(id);
alter table hr_pay add primary key(user_id);
alter table payslips add primary key(id);
alter table payslips add unique(period,user_id);
grant usage on schema auth,public to authenticated,anon,service_role;
grant all on all tables in schema public to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.app_actor_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select role from public.profiles where id = auth.uid() and active is distinct from false $function$
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
CREATE OR REPLACE FUNCTION public.hr_pay_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then return new; end if;
  if new.user_id = auth.uid() and my_role() not in ('admin', 'exec') then
    raise exception 'แก้ข้อมูลค่าจ้างของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารเป็นผู้แก้';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select case public.app_actor_role() when 'field_sales' then 'sales' when 'assistant' then 'tech' else coalesce(public.app_actor_role(),'none') end $function$
;
CREATE OR REPLACE FUNCTION public.profiles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
CREATE OR REPLACE FUNCTION public.role_hr_action_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
create view public."staff_directory" with (security_barrier=true) as  SELECT id,
    name,
    email,
    role,
    team,
    department,
    avatar_url,
    active
   FROM profiles
  WHERE ((auth.uid() IS NOT NULL) AND (app_actor_role() IS NOT NULL));
grant select on public."staff_directory" to authenticated;
create view public."team_directory" with (security_barrier=true) as  SELECT id,
    name,
    lead,
    van,
    color,
    type,
    phone
   FROM teams
  WHERE ((auth.uid() IS NOT NULL) AND (app_actor_role() IS NOT NULL));
grant select on public."team_directory" to authenticated;
create policy "app_config_read" on public."app_config" as PERMISSIVE for SELECT to "public" using (true) ;
create policy "app_config_write" on public."app_config" as PERMISSIVE for ALL to "public" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text])));
create policy "role_v831_hr_config_read" on public."app_config" as RESTRICTIVE for SELECT to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) <> 'hr'::text) OR (key = ANY (ARRAY['role_permissions'::text, 'hr_settings'::text, 'notify_settings'::text])))) ;
create policy "role_v831_hr_settings" on public."app_config" as PERMISSIVE for ALL to "authenticated" using (((key = 'hr_settings'::text) AND (app_actor_role() = 'hr'::text))) with check (((key = 'hr_settings'::text) AND (app_actor_role() = 'hr'::text)));
create policy "hr_adv_mgr" on public."hr_advances" as PERMISSIVE for ALL to "public" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text])));
create policy "hr_adv_self_del" on public."hr_advances" as PERMISSIVE for DELETE to "public" using (((user_id = auth.uid()) AND (status = 'pending'::text))) ;
create policy "hr_adv_self_ins" on public."hr_advances" as PERMISSIVE for INSERT to "public"  with check (((user_id = auth.uid()) AND (COALESCE(status, 'pending'::text) = 'pending'::text)));
create policy "hr_adv_self_read" on public."hr_advances" as PERMISSIVE for SELECT to "public" using ((user_id = auth.uid())) ;
create policy "hr_att_mgr" on public."hr_attendance" as PERMISSIVE for ALL to "public" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])));
create policy "hr_att_self_ins" on public."hr_attendance" as PERMISSIVE for INSERT to "public"  with check (((user_id = auth.uid()) AND (work_date = ((now() AT TIME ZONE 'Asia/Bangkok'::text))::date)));
create policy "hr_att_self_read" on public."hr_attendance" as PERMISSIVE for SELECT to "public" using ((user_id = auth.uid())) ;
create policy "hr_att_self_upd" on public."hr_attendance" as PERMISSIVE for UPDATE to "public" using (((user_id = auth.uid()) AND (work_date = ((now() AT TIME ZONE 'Asia/Bangkok'::text))::date))) with check (((user_id = auth.uid()) AND (work_date = ((now() AT TIME ZONE 'Asia/Bangkok'::text))::date)));
create policy "role_v831_hr_attendance_delete" on public."hr_attendance" as RESTRICTIVE for DELETE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) <> 'hr'::text) OR (user_id <> auth.uid()))) ;
create policy "hr_quota_read" on public."hr_leave_quota" as PERMISSIVE for SELECT to "public" using (true) ;
create policy "hr_quota_write" on public."hr_leave_quota" as PERMISSIVE for ALL to "public" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])));
create policy "role_v831_delete" on public."hr_leave_quota" as RESTRICTIVE for DELETE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'hr'::text) AND (user_id <> auth.uid()))))) ;
create policy "role_v831_insert" on public."hr_leave_quota" as RESTRICTIVE for INSERT to "authenticated"  with check (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'hr'::text) AND (user_id <> auth.uid())))));
create policy "role_v831_internal_anon" on public."hr_leave_quota" as RESTRICTIVE for ALL to "anon" using (false) with check (false);
create policy "role_v831_select" on public."hr_leave_quota" as RESTRICTIVE for SELECT to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((user_id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text, 'hr'::text]))))) ;
create policy "role_v831_update" on public."hr_leave_quota" as RESTRICTIVE for UPDATE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'hr'::text) AND (user_id <> auth.uid()))))) with check (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'hr'::text) AND (user_id <> auth.uid())))));
create policy "hr_leaves_mgr" on public."hr_leaves" as PERMISSIVE for ALL to "public" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])));
create policy "hr_leaves_self_del" on public."hr_leaves" as PERMISSIVE for DELETE to "public" using (((user_id = auth.uid()) AND (status = 'pending'::text))) ;
create policy "hr_leaves_self_ins" on public."hr_leaves" as PERMISSIVE for INSERT to "public"  with check (((user_id = auth.uid()) AND (COALESCE(status, 'pending'::text) = 'pending'::text)));
create policy "hr_leaves_self_read" on public."hr_leaves" as PERMISSIVE for SELECT to "public" using ((user_id = auth.uid())) ;
create policy "hr_loans_sel" on public."hr_loans" as PERMISSIVE for SELECT to "authenticated" using (((user_id = auth.uid()) OR (( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text, 'finance'::text])))) ;
create policy "hr_loans_wr" on public."hr_loans" as PERMISSIVE for ALL to "authenticated" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])));
create policy "hr_ot_del" on public."hr_ot" as PERMISSIVE for DELETE to "authenticated" using ((((user_id = auth.uid()) AND (status = 'pending'::text)) OR (my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])))) ;
create policy "hr_ot_ins" on public."hr_ot" as PERMISSIVE for INSERT to "authenticated"  with check ((((user_id = auth.uid()) AND (status = 'pending'::text)) OR (my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))));
create policy "hr_ot_sel" on public."hr_ot" as PERMISSIVE for SELECT to "authenticated" using (((user_id = auth.uid()) OR (( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])))) ;
create policy "hr_ot_self_checkout" on public."hr_ot" as PERMISSIVE for UPDATE to "authenticated" using (((user_id = auth.uid()) AND (status = 'approved'::text))) with check (((user_id = auth.uid()) AND (status = 'approved'::text)));
create policy "hr_ot_upd" on public."hr_ot" as PERMISSIVE for UPDATE to "authenticated" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])));
create policy "hr_pay_read" on public."hr_pay" as PERMISSIVE for SELECT to "authenticated" using (((user_id = auth.uid()) OR (( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text, 'finance'::text])))) ;
create policy "hr_pay_write" on public."hr_pay" as PERMISSIVE for ALL to "authenticated" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])));
create policy "role_v831_delete" on public."hr_pay" as RESTRICTIVE for DELETE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])))) ;
create policy "role_v831_insert" on public."hr_pay" as RESTRICTIVE for INSERT to "authenticated"  with check (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text]))));
create policy "role_v831_select" on public."hr_pay" as RESTRICTIVE for SELECT to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((user_id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text, 'hr'::text]))))) ;
create policy "role_v831_update" on public."hr_pay" as RESTRICTIVE for UPDATE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])))) with check (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text]))));
create policy "hr_profiles_read" on public."hr_profiles" as PERMISSIVE for SELECT to "public" using (((user_id = auth.uid()) OR (( SELECT my_role() AS my_role) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])))) ;
create policy "hr_profiles_write" on public."hr_profiles" as PERMISSIVE for ALL to "public" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text])));
create policy "payslips_rw" on public."payslips" as PERMISSIVE for ALL to "public" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text])));
create policy "payslips_self_read" on public."payslips" as PERMISSIVE for SELECT to "public" using ((user_id = auth.uid())) ;
create policy "role_v831_delete" on public."payslips" as RESTRICTIVE for DELETE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'hr'::text) AND (user_id <> auth.uid()) AND (status = 'draft'::text))))) ;
create policy "role_v831_insert" on public."payslips" as RESTRICTIVE for INSERT to "authenticated"  with check (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'hr'::text) AND (user_id <> auth.uid()) AND (status = 'draft'::text)))));
create policy "role_v831_select" on public."payslips" as RESTRICTIVE for SELECT to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((user_id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text, 'hr'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'finance'::text) AND (status = 'paid'::text))))) ;
create policy "role_v831_update" on public."payslips" as RESTRICTIVE for UPDATE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'hr'::text) AND (user_id <> auth.uid()) AND (status = 'draft'::text))))) with check (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR ((( SELECT app_actor_role() AS app_actor_role) = 'hr'::text) AND (user_id <> auth.uid()) AND (status = 'draft'::text)))));
create policy "prof_admin_insert" on public."profiles" as PERMISSIVE for INSERT to "authenticated"  with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text])));
create policy "prof_admin_write" on public."profiles" as PERMISSIVE for UPDATE to "authenticated" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text])));
create policy "prof_mgr_update" on public."profiles" as PERMISSIVE for UPDATE to "authenticated" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text]))) with check (((my_role() = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text])) OR (id = auth.uid())));
create policy "prof_read" on public."profiles" as PERMISSIVE for SELECT to "authenticated" using (true) ;
create policy "prof_self" on public."profiles" as PERMISSIVE for UPDATE to "authenticated" using ((id = auth.uid())) ;
create policy "role_v831_delete" on public."profiles" as RESTRICTIVE for DELETE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND (( SELECT app_actor_role() AS app_actor_role) = 'exec'::text))) ;
create policy "role_v831_insert" on public."profiles" as RESTRICTIVE for INSERT to "authenticated"  with check (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND (( SELECT app_actor_role() AS app_actor_role) = 'exec'::text)));
create policy "role_v831_select" on public."profiles" as RESTRICTIVE for SELECT to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR (( SELECT app_actor_role() AS app_actor_role) = 'hr'::text)))) ;
create policy "role_v831_update" on public."profiles" as RESTRICTIVE for UPDATE to "authenticated" using (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR (( SELECT app_actor_role() AS app_actor_role) = 'hr'::text)))) with check (((( SELECT app_actor_role() AS app_actor_role) IS NOT NULL) AND ((id = auth.uid()) OR (( SELECT app_actor_role() AS app_actor_role) = ANY (ARRAY['exec'::text, 'admin'::text])) OR (( SELECT app_actor_role() AS app_actor_role) = 'hr'::text))));
create policy "role_v831_hr_team_finance" on public."teams" as RESTRICTIVE for SELECT to "authenticated" using ((( SELECT app_actor_role() AS app_actor_role) <> 'hr'::text)) ;
create policy "team_read" on public."teams" as PERMISSIVE for SELECT to "authenticated" using (true) ;
create policy "team_write" on public."teams" as PERMISSIVE for ALL to "authenticated" using ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text]))) with check ((my_role() = ANY (ARRAY['admin'::text, 'exec'::text])));
CREATE TRIGGER hr_pay_guard_trg BEFORE INSERT OR UPDATE ON public.hr_pay FOR EACH ROW EXECUTE FUNCTION hr_pay_guard();
CREATE TRIGGER role_hr_action_v831 BEFORE INSERT OR DELETE OR UPDATE ON public.hr_pay FOR EACH ROW EXECUTE FUNCTION role_hr_action_guard();
CREATE TRIGGER role_hr_action_v831 BEFORE INSERT OR DELETE OR UPDATE ON public.payslips FOR EACH ROW EXECUTE FUNCTION role_hr_action_guard();
CREATE TRIGGER profiles_guard_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_guard();
