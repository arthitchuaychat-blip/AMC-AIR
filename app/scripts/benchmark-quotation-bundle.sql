begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from profiles where role='sales' and active limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare started timestamptz; payload jsonb; r jsonb; h jsonb; z jsonb; ids text[]; cids text[]; sids text[]; old_ms numeric[]:='{}'; new_ms numeric[]:='{}'; bytes int;
begin
for n in 1..5 loop
 started:=clock_timestamp(); r:=quotation_page(); select array_agg(x) into ids from jsonb_array_elements_text(r->'nos') x;
 select jsonb_agg(q),array_agg(customer_id::text),array_agg(site_id::text) into h,cids,sids from quotations q where quote_no=any(ids);
 select jsonb_agg(i order by id) into z from quotation_items i where quote_no=any(ids);
 select jsonb_agg(c) into z from customers c where id::text=any(cids);
 select jsonb_agg(s) into z from customer_sites s where id::text=any(sids);
 select jsonb_agg(c order by id) into z from customer_contacts c where customer_id::text=any(cids);
 select jsonb_agg(j order by job_no) into z from job_orders j where quote_no=any(ids);
 select jsonb_agg(i order by invoice_no) into z from invoices i where quote_no=any(ids);
 select jsonb_object_agg(id,name) into z from profiles where id::text in(select x->>'created_by' from jsonb_array_elements(h) x);
 old_ms:=array_append(old_ms,extract(epoch from clock_timestamp()-started)*1000);
 started:=clock_timestamp(); payload:=quotation_page_bundle();
 new_ms:=array_append(new_ms,extract(epoch from clock_timestamp()-started)*1000);
 bytes:=octet_length(payload::text);
end loop;
perform set_config('amc.perf_bundle',jsonb_build_object('previous_page_hydration_db_ms',old_ms,'bundle_db_ms',new_ms,'bundle_bytes',bytes,'page_count',jsonb_array_length(payload->'nos'))::text,true);
end $$;
select current_setting('amc.perf_bundle')::jsonb as measurement;
rollback;
