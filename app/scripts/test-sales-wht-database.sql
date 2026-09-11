-- Run with psql ON_ERROR_STOP. All fixtures and auth changes are rolled back.
begin;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000008321','wht-v832@example.invalid');
update profiles set role='exec',active=true where id='00000000-0000-4000-8000-000000008321';
insert into customers(id,name,type) overriding system value values(-83201,'WHT fixture company','company'),(-83202,'WHT fixture person','person');
insert into quotations(quote_no,customer_id,status,wht,wht_rate,vat) values('TEST-WHT-832-Q',-83201,'approved',true,3,true),('TEST-WHT-832-P',-83202,'approved',true,3,false);
insert into quotation_items(quote_no,item_code,name,kind,qty,unit_price) values('TEST-WHT-832-Q',null,'Test product','ac',1,20000),('TEST-WHT-832-Q',null,'Test service','service',1,5000);
insert into invoices(invoice_no,quote_no,customer_id,base,vat_amt,total,wht_enabled,wht_rate,status,items)
values('TEST-WHT-832-I','TEST-WHT-832-Q',-83201,25000,1750,26750,true,3,'unpaid','[{"name":"Test product","kind":"ac","amount":20000},{"name":"Test service","kind":"service","amount":5000}]'),
('TEST-WHT-832-IP','TEST-WHT-832-P',-83202,1000,0,1000,true,3,'unpaid','[{"name":"Test service","kind":"service","amount":1000}]');
do $$ begin
 if (select wht from quotations where quote_no='TEST-WHT-832-P') then raise exception 'personal quotation WHT'; end if;
 if (select wht_amt from invoices where invoice_no='TEST-WHT-832-I')<>150 then raise exception 'corporate service calculation'; end if;
 if (select wht_amt from invoices where invoice_no='TEST-WHT-832-IP')<>0 then raise exception 'personal invoice WHT'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008321","role":"authenticated"}',true);
select update_sales_wht('invoice','TEST-WHT-832-I',true,0,'test zero');
do $$ begin if (select wht_amt from invoices where invoice_no='TEST-WHT-832-I')<>0 or (select wht_rate from invoices where invoice_no='TEST-WHT-832-I')<>0 then raise exception 'zero rate changed'; end if; end $$;
select update_sales_wht('invoice','TEST-WHT-832-I',true,3,'restore test rate');
insert into receipts(receipt_no,invoice_no,quote_no,customer_id,base,vat_amt,total,wht,wht_rate,status,issue_date,items)
select 'TEST-WHT-832-R',invoice_no,quote_no,customer_id,base,vat_amt,total,true,wht_rate,'pending','2026-08-01',items from invoices where invoice_no='TEST-WHT-832-I';
do $$ begin
 if (select wht_amt from receipts where receipt_no='TEST-WHT-832-R')<>150 or (select net from receipts where receipt_no='TEST-WHT-832-R')<>26600 then raise exception 'receipt differs'; end if;
 begin perform update_sales_wht('invoice','TEST-WHT-832-I',true,1,'must lock child');raise exception 'TEST-FAILED'; exception when others then if sqlerrm='TEST-FAILED' then raise; end if; end;
end $$;
update receipts set status='paid' where receipt_no='TEST-WHT-832-R';
do $$ begin if (select paid_on from receipts where receipt_no='TEST-WHT-832-R')<>(now() at time zone 'Asia/Bangkok')::date then raise exception 'paid date did not update'; end if; end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update profiles set role='sales' where id='00000000-0000-4000-8000-000000008321';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008321","role":"authenticated"}',true);
do $$ begin
 if public.app_can('accounting',true) then raise exception 'sales has accounting unexpectedly'; end if;
 if not claim_receipt_flowaccount('TEST-WHT-832-R') then raise exception 'sales cannot claim'; end if;
 if claim_receipt_flowaccount('TEST-WHT-832-R') then raise exception 'duplicate claim allowed'; end if;
 begin perform update_sales_wht('receipt','TEST-WHT-832-R',true,1,'must lock export');raise exception 'TEST-FAILED'; exception when others then if sqlerrm='TEST-FAILED' then raise; end if; end;
end $$;
select set_receipt_flowaccount('TEST-WHT-832-R','TEST-ID','TEST-NO');
do $$ begin
 perform release_receipt_flowaccount('TEST-WHT-832-R');
 if (select flowaccount_at from receipts where receipt_no='TEST-WHT-832-R') is null then raise exception 'released successful export'; end if;
 begin perform clear_sales_flowaccount_placeholder('TEST-WHT-832-R');raise exception 'TEST-FAILED'; exception when others then if sqlerrm='TEST-FAILED' then raise; end if; end;
end $$;
insert into sales_wht_evidence(receipt_no,withheld_amount,status) values('TEST-WHT-832-R',150,'waiting');
insert into storage.objects(bucket_id,name) values('sales-wht-evidence','00000000-0000-4000-8000-000000008321/fixture.pdf');
update sales_wht_evidence set certificate_no='TEST-CERT',certificate_date='2026-09-11',received_on='2026-09-11',file_path='00000000-0000-4000-8000-000000008321/fixture.pdf',status='received' where receipt_no='TEST-WHT-832-R';

do $$ begin
 begin update sales_wht_evidence set status='verified' where receipt_no='TEST-WHT-832-R';raise exception 'TEST-FAILED'; exception when others then if sqlerrm='TEST-FAILED' then raise; end if; end;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update profiles set role='finance' where id='00000000-0000-4000-8000-000000008321';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008321","role":"authenticated"}',true);
do $$ begin
 begin update sales_wht_evidence set status='verified',withheld_amount=140 where receipt_no='TEST-WHT-832-R';raise exception 'TEST-FAILED'; exception when others then if sqlerrm='TEST-FAILED' then raise; end if; end;
end $$;
update sales_wht_evidence set status='verified' where receipt_no='TEST-WHT-832-R';
do $$ begin
 if not exists(select from sales_wht_evidence where receipt_no='TEST-WHT-832-R' and status='verified' and verified_by=auth.uid()) then raise exception 'finance verify failed'; end if;
 if not exists(select from sales_wht_locks() where kind='receipt' and document_no='TEST-WHT-832-R') then raise exception 'UI lock missing'; end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
update profiles set role='hr' where id='00000000-0000-4000-8000-000000008321';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000008321","role":"authenticated"}',true);
do $$ begin
 if exists(select from sales_wht_evidence) then raise exception 'HR evidence leak'; end if;
 begin perform claim_receipt_flowaccount('TEST-WHT-832-R');raise exception 'TEST-FAILED'; exception when others then if sqlerrm='TEST-FAILED' then raise; end if; end;
end $$;
reset role;
select 'PASS WHT corporate/personal, calculations, zero, downstream lock, payment date, sales export without accounting, duplicate export, evidence permission and HR denial; rollback follows' as test;

rollback;
