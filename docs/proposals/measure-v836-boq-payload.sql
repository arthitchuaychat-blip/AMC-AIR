-- Read-only aggregate benchmark. No document/customer values are returned.
begin read only; set local statement_timeout='10s'; select set_config('request.jwt.claim.sub',(select id::text from public.profiles where active and role='admin' limit 1),true) is not null as actor_selected; set local role authenticated;
select (select count(*) from public.boqs) as total_documents,(select count(*) from public.boq_items) as total_items,octet_length((jsonb_build_object('boqs',(select jsonb_agg(to_jsonb(b)) from public.boqs b),'items',(select jsonb_agg(to_jsonb(i)) from public.boq_items i),'customers',(select jsonb_agg(to_jsonb(c)) from public.customers c),'sites',(select jsonb_agg(jsonb_build_object('id',id,'site_name',site_name,'address',address,'map_url',map_url,'contact_name',contact_name,'phone',phone)) from public.customer_sites),'contacts',(select jsonb_agg(jsonb_build_object('customer_id',customer_id,'name',name,'phone',phone)) from public.customer_contacts),'quotes',(select jsonb_agg(jsonb_build_object('quote_no',quote_no,'boq_no',boq_no,'status',status)) from public.quotations)))::text) as old_list_bytes,octet_length(page::text) as new_page_bytes,jsonb_array_length(page->'rows') as new_rows from (with needle as (
 select lower(normalize(regexp_replace(trim(coalesce(''::text,'')),'\s+',' ','g'),NFC)) as text,
 regexp_replace(coalesce(''::text,''),'[^0-9]','','g') as phone
), source as materialized (
 select b.boq_no,b.customer_id,b.site_id,b.title,b.job_type,b.status,b.created_at,b.issue_date,
 b.internal_note,b.created_by,coalesce(p.name,'') as creator,
 c.name as customer_name,c.address as customer_address,
 cs.site_name,cs.address as site_address,cs.map_url as site_map_url,
 coalesce(nullif(cs.contact_name,''),ct.name) as contact_name,
 coalesce(nullif(cs.phone,''),ct.phone) as contact_phone,
 coalesce(b.issue_date,(b.created_at at time zone 'UTC')::date) as doc_date,
 -- Keep the existing field-by-field, whitespace-normalized and phone search.
 (n.text='' or exists(select 1 from unnest(array[b.boq_no,c.name,coalesce(nullif(cs.contact_name,''),ct.name),b.title,b.note,b.internal_note]) f
    where strpos(lower(normalize(regexp_replace(trim(coalesce(f,'')),'\s+',' ','g'),NFC)),n.text)>0)
    or (n.phone<>'' and strpos(regexp_replace(coalesce(nullif(cs.phone,''),ct.phone,''),'[^0-9]','','g'),n.phone)>0)) as matches
 from public.boqs b left join public.customers c on c.id=b.customer_id
 left join public.customer_sites cs on cs.id=b.site_id
 left join public.profiles p on p.id=b.created_by
 left join lateral(select name,phone from public.customer_contacts where customer_id=b.customer_id order by id limit 1)ct on true
 cross join needle n
), base as materialized (
 select * from source where matches and (date '2026-03-14' is null or doc_date>=date '2026-03-14') and (date '2026-09-14' is null or doc_date<=date '2026-09-14')
), filtered as materialized (
 select * from base where (coalesce('all'::text,'all')='all' or job_type='all'::text)
 and (coalesce(''::text,'')='' or creator=''::text)
), page as materialized (
 select * from filtered order by created_at desc,boq_no limit 50 offset greatest(coalesce(0,0),0)
), rows as materialized (
 select pg.*, q.quote_no,coalesce(q.approved,false) as quote_approved,
 coalesce(it.total,0) as total,coalesce(it.item_count,0) as item_count
 from page pg
 left join lateral (
   select quote_no,status='approved' as approved from public.quotations
   where boq_no=pg.boq_no and status<>'cancelled'
   order by (status='approved') desc,case when status='approved' then quote_no end desc,quote_no asc limit 1
 )q on true
 left join lateral(select sum(qty*unit_cost) as total,count(*) as item_count from public.boq_items where boq_no=pg.boq_no)it on true
), qnos as (select distinct quote_no from rows where quote_no is not null)
select jsonb_build_object(
 'rows',coalesce((select jsonb_agg(jsonb_build_object(
   'boq_no',r.boq_no,'customer_id',r.customer_id,'site_id',r.site_id,'title',r.title,
   'job_type',r.job_type,'status',r.status,'created_at',r.created_at,'issue_date',r.issue_date,
   'internal_note',r.internal_note,'createdByName',r.creator,'customerName',r.customer_name,
   'customerAddr',r.customer_address,'siteName',r.site_name,'siteAddress',r.site_address,
   'mapUrl',r.site_map_url,'contactName',r.contact_name,'contactPhone',r.contact_phone,
   'quoteNo',r.quote_no,'hasQuote',r.quote_no is not null,'quoteApproved',r.quote_approved,
   'total',r.total,'itemCount',r.item_count
 ) order by created_at desc,boq_no) from rows r),'[]'::jsonb),
 'total',(select count(*) from filtered),'baseTotal',(select count(*) from base),
 'allTotal',(select count(*) from source),
 'hidden',(select count(*) from source where (date '2026-03-14' is not null and doc_date<date '2026-03-14') or (date '2026-09-14' is not null and doc_date>date '2026-09-14')),
 'creators',coalesce((select jsonb_agg(creator order by creator) from(select distinct creator from source where creator<>'')x),'[]'::jsonb),
 'types',coalesce((select jsonb_object_agg(job_type,n) from(select coalesce(job_type,'') as job_type,count(*) n from base group by job_type)x),'{}'::jsonb),
 'links',jsonb_build_object('byQuote',coalesce((select jsonb_object_agg(q.quote_no,jsonb_build_object(
   'jobNos',coalesce((select jsonb_agg(job_no order by job_no) from public.job_orders where quote_no=q.quote_no),'[]'::jsonb),
   'invoiceNos',coalesce((select jsonb_agg(invoice_no order by invoice_no) from public.invoices where quote_no=q.quote_no and status<>'cancelled'),'[]'::jsonb),
   'receiptNos',coalesce((select jsonb_agg(receipt_no order by receipt_no) from public.receipts where quote_no=q.quote_no and status<>'cancelled'),'[]'::jsonb),
   'poNos',coalesce((select jsonb_agg(po_no order by po_no) from public.purchase_orders where quote_no=q.quote_no and status<>'cancelled'),'[]'::jsonb)
 )) from qnos q),'{}'::jsonb),
 'jobStatusBy',coalesce((select jsonb_object_agg(job_no,status) from public.job_orders where quote_no in(select quote_no from qnos)),'{}'::jsonb))
)) v(page);rollback;