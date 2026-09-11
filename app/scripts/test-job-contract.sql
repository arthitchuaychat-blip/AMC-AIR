insert into teams(id,name,type) values ('__test_contract_team','test','sub');
insert into materials(code,name_th,kind,category) values
 ('__test_contract_mat','test material','material','a-ท่อทองแดง'),
 ('__test_contract_part','test part','material','l-อุปกรณ์เสริม-และ-อะไหล่');
insert into quotations(quote_no,status) values ('__test_contract_quote','draft');
insert into quotation_items(quote_no,name,kind,item_code,qty,unit_price) values
 ('__test_contract_quote','service','service',null,1,4000),
 ('__test_contract_quote','material','material','__test_contract_mat',1,2000),
 ('__test_contract_quote','part','material','__test_contract_part',1,5000),
 ('__test_contract_quote','air','ac',null,1,20000);
insert into job_orders(job_no,assigned_team,quote_no,labor_mode) values ('__test_contract_job','__test_contract_team','__test_contract_quote','labor');
do $$ begin
 if (select labor_total from job_orders where job_no='__test_contract_job')<>2000 then raise exception 'labor rate/exclusion failed'; end if;
end $$;
update job_orders set labor_mode='inclusive' where job_no='__test_contract_job';
do $$ begin
 if (select labor_total from job_orders where job_no='__test_contract_job')<>3900 then raise exception 'inclusive failed'; end if;
end $$;
update job_orders set labor_mode='daily' where job_no='__test_contract_job';
insert into job_visits(job_no,assigned_team,visit_date,end_date,status) values
 ('__test_contract_job','__test_contract_team','2026-09-10','2026-09-12','scheduled'),
 ('__test_contract_job','__test_contract_team','2026-09-11',null,'scheduled'),
 ('__test_contract_job','__test_contract_team','2026-09-15',null,'cancelled');
do $$ begin
 if (select labor_total from job_orders where job_no='__test_contract_job')<>6000 then raise exception 'date dedup/range/cancel failed'; end if;
end $$;
delete from job_visits where job_no='__test_contract_job' and visit_date='2026-09-10';
do $$ begin
 if (select labor_total from job_orders where job_no='__test_contract_job')<>2000 then raise exception 'calendar delete failed'; end if;
end $$;
update job_orders set labor_total=2500,labor_manual=true,labor_review_required=false where job_no='__test_contract_job';
insert into job_visits(job_no,assigned_team,visit_date) values ('__test_contract_job','__test_contract_team','2026-09-16');
do $$ begin
 if not exists(select 1 from job_orders where job_no='__test_contract_job' and labor_total=2500 and labor_review_required) then raise exception 'manual protection failed'; end if;
end $$;
update job_orders set labor_manual=false,labor_rate_config=null where job_no='__test_contract_job';
update job_orders set labor_confirmed=true where job_no='__test_contract_job';
insert into job_visits(job_no,assigned_team,visit_date) values ('__test_contract_job','__test_contract_team','2026-09-17');
do $$ begin
 if not exists(select 1 from job_orders where job_no='__test_contract_job' and labor_total=4000 and labor_calendar_days=3 and labor_review_required) then raise exception 'confirmed protection failed'; end if;
 if has_function_privilege('authenticated','public.recalculate_job_contract(text)','EXECUTE') then raise exception 'internal helper exposed'; end if;
end $$;
select 'PASS: labor/inclusive/exclusions/calendar changes/manual and confirmed protection/internal permissions' as result;
