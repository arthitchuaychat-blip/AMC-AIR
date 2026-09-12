-- Read-only business data; all session/transaction changes rolled back.
begin;

select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from profiles where role='sales' and active limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$
declare started timestamptz; payload jsonb; r jsonb; old_ms numeric[]:='{}'; new_ms numeric[]:='{}'; old_bytes int; new_bytes int; old_items int; new_items int;
begin
 for n in 1..5 loop
 started:=clock_timestamp();
 select jsonb_build_object('quotes',(select jsonb_agg(q) from quotations q),'items',(select jsonb_agg(i) from quotation_items i)) into payload;
 old_ms:=array_append(old_ms,extract(epoch from clock_timestamp()-started)*1000);
 old_bytes:=octet_length(payload::text); old_items:=jsonb_array_length(payload->'items');
 started:=clock_timestamp(); r:=quotation_page();
 select jsonb_build_object('quotes',(select jsonb_agg(q) from quotations q where quote_no in (select jsonb_array_elements_text(r->'nos'))),'items',(select jsonb_agg(i) from quotation_items i where quote_no in(select jsonb_array_elements_text(r->'nos'))),'page',r) into payload;
 new_ms:=array_append(new_ms,extract(epoch from clock_timestamp()-started)*1000);
 new_bytes:=octet_length(payload::text);new_items:=jsonb_array_length(payload->'items');
 end loop;
 perform set_config('amc.perf_result',jsonb_build_object('before_db_ms',old_ms,'after_db_ms',new_ms,'before_bytes',old_bytes,'after_bytes',new_bytes,'before_items',old_items,'after_items',new_items)::text,true);
end $$;
select current_setting('amc.perf_result')::jsonb as measurement;
rollback;
