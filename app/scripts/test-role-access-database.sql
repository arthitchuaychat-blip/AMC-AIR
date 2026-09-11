-- Apply the proposed schema in the same rollback transaction or run against an authorized test schema.
begin;
-- These fixtures and every DDL change are rolled back by the surrounding transaction.
insert into auth.users(id,email) values
 ('00000000-0000-4000-8000-000000008311','role-v831-one@example.invalid'),
 ('00000000-0000-4000-8000-000000008312','role-v831-two@example.invalid');
update public.profiles set active=true,role='exec',name='Role test one' where id='00000000-0000-4000-8000-000000008311';
update public.profiles set active=true,role='tech',name='Role test two' where id='00000000-0000-4000-8000-000000008312';
insert into public.hr_pay(user_id,base_pay) values('00000000-0000-4000-8000-000000008311',21000),('00000000-0000-4000-8000-000000008312',23000);
insert into public.payslips(user_id,period,net,status) values('00000000-0000-4000-8000-000000008311','2099-01',21000,'draft'),('00000000-0000-4000-8000-000000008312','2099-01',23000,'draft');
insert into public.teams(id,name) values('role-v831-a','Role test A'),('role-v831-b','Role test B');
insert into public.job_orders(job_no,title,assigned_team,status) values('ROLE-V831-A','Role test A','role-v831-a','pending'),('ROLE-V831-B','Role test B','role-v831-b','pending');
update public.profiles set team='role-v831-a' where id='00000000-0000-4000-8000-000000008311';

reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='exec',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'exec' then raise exception 'wrong role exec'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing exec'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing exec'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing exec'; end if;
end $$;
do $$ begin
   if not public.app_can('hr',true) or not public.app_can('cashflow',true) or not public.app_can('myjobs',true) then raise exception 'management missing module'; end if;
   update public.hr_pay set base_pay=21001 where user_id=auth.uid();
   if not found then raise exception 'management own wage blocked'; end if;
   if (select count(*) from public.job_orders where job_no like 'ROLE-V831-%')<>2 then raise exception 'management all teams blocked'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='admin',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'admin' then raise exception 'wrong role admin'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing admin'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing admin'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing admin'; end if;
end $$;
do $$ begin
   if not public.app_can('hr',true) or not public.app_can('cashflow',true) or not public.app_can('myjobs',true) then raise exception 'management missing module'; end if;
   update public.hr_pay set base_pay=21001 where user_id=auth.uid();
   if not found then raise exception 'management own wage blocked'; end if;
   if (select count(*) from public.job_orders where job_no like 'ROLE-V831-%')<>2 then raise exception 'management all teams blocked'; end if;
  end $$;
do $$ begin
   begin
    update public.profiles set role='exec' where id=auth.uid();
    if found then raise exception 'manager escalated role'; end if;
   exception when insufficient_privilege then null; end;
   begin
    update public.app_config set value=value where key='role_permissions';
    if found then raise exception 'manager changed permission configuration'; end if;
   exception when insufficient_privilege then null; end;
   update public.app_config set value=value where key='hr_settings';
   if not found then raise exception 'manager general settings blocked'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='hr',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'hr' then raise exception 'wrong role hr'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing hr'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing hr'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing hr'; end if;
end $$;
do $$ begin
   if public.app_can('quote') or public.app_can('chat') or public.app_can('cashflow') then raise exception 'HR sales inheritance'; end if;
   if exists(select from public.quotations) or exists(select from public.customers) or exists(select from public.accounts) or exists(select from public.account_entries) then raise exception 'HR sensitive data leak'; end if;
   if json_array_length(public.jobs_for_team(null))<>0 then raise exception 'HR field RPC leak'; end if;
   update public.payslips set net=23001 where user_id='00000000-0000-4000-8000-000000008312' and period='2099-01';
   if not found then raise exception 'HR cannot prepare draft'; end if;
   begin
    update public.payslips set status='paid' where user_id='00000000-0000-4000-8000-000000008312' and period='2099-01';
    if found then raise exception 'HR approved payroll'; end if;
   exception when insufficient_privilege then null; end;
   begin
    update public.profiles set role='exec' where id=auth.uid();
    if found then raise exception 'HR escalated role'; end if;
   exception when insufficient_privilege then null; end;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='finance',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'finance' then raise exception 'wrong role finance'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing finance'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing finance'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing finance'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='sales',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'sales' then raise exception 'wrong role sales'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing sales'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing sales'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing sales'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='field_sales',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'field_sales' then raise exception 'wrong role field_sales'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing field_sales'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing field_sales'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing field_sales'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='lead_tech',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'lead_tech' then raise exception 'wrong role lead_tech'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing lead_tech'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing lead_tech'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing lead_tech'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
do $$ declare j json:=public.jobs_for_team(null); begin
   if (select count(*) from json_array_elements(j) x where x->>'job_no' like 'ROLE-V831-%')<>2 then raise exception 'head technician missing all teams'; end if;
   if j::text like '%labor_total%' then raise exception 'field RPC leaked private prices'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='tech',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'tech' then raise exception 'wrong role tech'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing tech'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing tech'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing tech'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
do $$ begin
   if exists(select from json_array_elements(public.jobs_for_team('role-v831-b')) x where x->>'job_no'='ROLE-V831-B') then raise exception 'technician crossed team'; end if;
   if not exists(select from json_array_elements(public.jobs_for_team(null)) x where x->>'job_no'='ROLE-V831-A') then raise exception 'own team missing'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='assistant',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'assistant' then raise exception 'wrong role assistant'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing assistant'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing assistant'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing assistant'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
do $$ begin
   if exists(select from json_array_elements(public.jobs_for_team('role-v831-b')) x where x->>'job_no'='ROLE-V831-B') then raise exception 'technician crossed team'; end if;
   if not exists(select from json_array_elements(public.jobs_for_team(null)) x where x->>'job_no'='ROLE-V831-A') then raise exception 'own team missing'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='stock',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'stock' then raise exception 'wrong role stock'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing stock'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing stock'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing stock'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='graphic',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'graphic' then raise exception 'wrong role graphic'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing graphic'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing graphic'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing graphic'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set role='maid',active=true where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin
 if public.app_actor_role()<>'maid' then raise exception 'wrong role maid'; end if;
 if not public.app_can('attendance',true) then raise exception 'self service missing maid'; end if;
 if (select count(*) from public.hr_pay where user_id=auth.uid())<>1 then raise exception 'own live salary missing maid'; end if;
 if (select count(*) from public.payslips where user_id=auth.uid() and period='2099-01')<>1 then raise exception 'own payslip missing maid'; end if;
end $$;
do $$ begin
   if exists(select from public.profiles where id<>auth.uid()) then raise exception 'private profiles leaked'; end if;
   if exists(select from public.hr_pay where user_id<>auth.uid()) then raise exception 'wages leaked'; end if;
   if exists(select from public.payslips where user_id<>auth.uid() and status='draft') then raise exception 'draft payroll leaked'; end if;
   if (select count(*) from public.staff_directory)<2 then raise exception 'directory missing'; end if;
  end $$;
reset role; select set_config('request.jwt.claims','{}',true);
update public.profiles set active=false where id='00000000-0000-4000-8000-000000008311';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008311","role":"authenticated"}',true);
do $$ begin if public.app_actor_role() is not null or exists(select from public.hr_pay) then raise exception 'inactive access allowed'; end if; end $$;
reset role; select set_config('request.jwt.claims','{}',true); set local role anon;
do $$ begin if exists(select from public.loans) or exists(select from public.hr_leave_quota) then raise exception 'anonymous internal data exposed'; end if; end $$;
reset role; select 'PASS: 12 roles, own salary, drafts, HR fences, manager escalation, all-team/own-team, inactive and anonymous boundaries; all fixtures rolled back' as test;
rollback;