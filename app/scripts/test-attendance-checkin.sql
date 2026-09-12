-- Synthetic user and attendance rows; all changes are rolled back.
begin;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000009121','attendance-test@example.invalid');
update profiles set role='sales',active=true where id='00000000-0000-4000-8000-000000009121';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009121","role":"authenticated"}',true);
insert into hr_attendance(user_id,work_date,check_in_at,hol_ok,ot_ok) values (auth.uid(),public.hr_today(),now()+interval '5 minutes',true,true);
do $$ begin
 if not exists(select 1 from hr_attendance where user_id=auth.uid() and check_in_at=now() and hol_ok=false and ot_ok is null) then raise exception 'checkin/default/server-clock failed'; end if;
end $$;
update hr_attendance set check_out_at=now()+interval '1 second',hol_ok=true,ot_ok=true where user_id=auth.uid();
do $$ begin
 if not exists(select 1 from hr_attendance where user_id=auth.uid() and check_out_at=now() and hol_ok=false and ot_ok is null) then raise exception 'checkout/self-approval guard failed'; end if;
end $$;
select 'PASS: employee check-in and check-out; server time; holiday/OT self-approval blocked' as result;
rollback;
