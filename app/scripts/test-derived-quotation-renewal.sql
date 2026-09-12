begin;
insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000009122','renew-test@example.invalid');
update public.profiles set role='sales',active=true where id='00000000-0000-4000-8000-000000009122';
insert into public.quotations(quote_no,status,valid_until,title) values ('TEST-RENEW-ROLLBACK','sent',current_date-5,'preserve me');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009122","role":"authenticated"}',true);
do $$ begin
 begin perform public.renew_quotation('TEST-RENEW-ROLLBACK',current_date-1,'old'); raise exception 'accepted past date'; exception when others then if sqlerrm='accepted past date' then raise; end if; end;
 perform public.renew_quotation('TEST-RENEW-ROLLBACK',current_date+7,'customer returned');
 if not exists(select 1 from quotations where quote_no='TEST-RENEW-ROLLBACK' and status='sent' and valid_until=current_date+7 and title='preserve me' and approved_at is null) then raise exception 'renew failed'; end if;
 begin perform public.renew_quotation('TEST-RENEW-ROLLBACK',current_date+8,'duplicate'); raise exception 'accepted duplicate'; exception when others then if sqlerrm='accepted duplicate' then raise; end if; end;
end $$;
reset role;
do $$ begin
 if (select count(*) from audit_logs where target_no='TEST-RENEW-ROLLBACK')<>1 then raise exception 'audit failed'; end if;
end $$;
select set_config('request.jwt.claims','{}',true);
update public.profiles set role='hr' where id='00000000-0000-4000-8000-000000009122';
update public.quotations set status='expired' where quote_no='TEST-RENEW-ROLLBACK';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000009122","role":"authenticated"}',true);
do $$ begin
 begin perform public.renew_quotation('TEST-RENEW-ROLLBACK',current_date+7,'denied'); raise exception 'HR accepted'; exception when others then if sqlerrm='HR accepted' then raise; end if; end;
end $$;
reset role;
select 'PASS renewal, old date rejected, duplicate rejected, audit, HR denied; all rolled back' as result;

rollback;
