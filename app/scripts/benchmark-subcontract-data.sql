begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from profiles where role='exec' and active limit 1),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare t timestamptz; payload jsonb; nos text[]; old_times numeric[]:='{}'; new_times numeric[]:='{}'; old_bytes int; new_bytes int;
begin
select array_agg(distinct j.quote_no) into nos from job_orders j join teams t on t.id=j.assigned_team where t.type='sub' and j.status<>'cancelled' and j.quote_no is not null;
for n in 1..5 loop
t:=clock_timestamp();
select jsonb_build_object('quotes',(select jsonb_agg(q) from quotations q),'items',(select jsonb_agg(i) from quotation_items i)) into payload;
old_times:=array_append(old_times,extract(epoch from clock_timestamp()-t)*1000);old_bytes:=octet_length(payload::text);
t:=clock_timestamp();
select jsonb_build_object('quotes',(select jsonb_agg(q) from quotations q where quote_no=any(nos)),'items',(select jsonb_agg(i) from quotation_items i where quote_no=any(nos))) into payload;
new_times:=array_append(new_times,extract(epoch from clock_timestamp()-t)*1000);new_bytes:=octet_length(payload::text);
end loop;
perform set_config('amc.bench',jsonb_build_object('before_ms',old_times,'after_ms',new_times,'before_bytes',old_bytes,'after_bytes',new_bytes)::text,true);
end $$;
select current_setting('amc.bench')::jsonb as result; rollback;
