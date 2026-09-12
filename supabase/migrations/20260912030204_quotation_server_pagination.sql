create or replace function public.quotation_page(p_search text default '',p_from date default null,p_to date default null,p_status text default 'all',p_vat text default 'all',p_creator text default '',p_docs text[] default '{}',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with source as materialized (
 select q.quote_no,q.created_at,q.issue_date,
 case when q.status in ('draft','sent') and q.valid_until < (now() at time zone 'Asia/Bangkok')::date then 'expired' else q.status end as status,
 q.vat,coalesce(p.name,'') as creator,
 exists(select from invoices i where i.quote_no=q.quote_no and i.status<>'cancelled') as has_invoice,
 exists(select from job_orders j where j.quote_no=q.quote_no and j.status<>'cancelled') as has_job,
 q.status<>'cancelled' and exists(select from quotation_items it where it.quote_no=q.quote_no and it.kind='ac')
 and not exists(select from purchase_orders po where po.quote_no=q.quote_no and po.status<>'cancelled') as no_ac_po
 from quotations q left join customers c on c.id=q.customer_id left join profiles p on p.id=q.created_by
 where coalesce(p_search,'')='' or
 strpos(lower(concat_ws(' ',q.quote_no,q.boq_no,q.title,q.note,q.internal_note,c.name)),lower(trim(p_search)))>0
 or exists(select from customer_contacts ct where ct.customer_id=q.customer_id and (strpos(lower(coalesce(ct.name,'')),lower(trim(p_search)))>0 or (regexp_replace(p_search,'[^0-9]','','g')<>'' and strpos(regexp_replace(coalesce(ct.phone,''),'[^0-9]','','g'),regexp_replace(p_search,'[^0-9]','','g'))>0)))
 or exists(select from customer_sites s where s.id=q.site_id and (strpos(lower(coalesce(s.contact_name,'')),lower(trim(p_search)))>0 or (regexp_replace(p_search,'[^0-9]','','g')<>'' and strpos(regexp_replace(coalesce(s.phone,''),'[^0-9]','','g'),regexp_replace(p_search,'[^0-9]','','g'))>0)))
), base as materialized (
 select * from source where (p_from is null or issue_date>=p_from) and (p_to is null or issue_date<=p_to)
), filtered as materialized (
 select * from base where (p_status='all' or status=p_status) and (p_vat='all' or vat=(p_vat='vat'))
 and (coalesce(p_creator,'')='' or creator=p_creator)
 and (not ('no_invoice'=any(p_docs)) or not has_invoice)
 and (not ('no_job'=any(p_docs)) or not has_job)
 and (not ('no_ac_po'=any(p_docs)) or no_ac_po)
), page as materialized (
 select * from filtered order by created_at desc,quote_no limit 50 offset greatest(coalesce(p_offset,0),0)
)
select jsonb_build_object(
 'nos',coalesce((select jsonb_agg(quote_no order by created_at desc,quote_no) from page),'[]'::jsonb),
 'total',(select count(*) from filtered),'baseTotal',(select count(*) from base),
 'hidden',(select count(*) from source)-(select count(*) from base),
 'creators',coalesce((select jsonb_agg(creator order by creator) from (select distinct coalesce(p.name,'') creator from quotations q join profiles p on p.id=q.created_by where coalesce(p.name,'')<>'') x),'[]'::jsonb),
 'statuses',coalesce((select jsonb_object_agg(status,n) from(select status,count(*) n from base group by status) x),'{}'::jsonb),
 'vatCount',(select count(*) from base where vat),'novatCount',(select count(*) from base where not vat),
 'noInvoice',(select count(*) from base where not has_invoice),'noJob',(select count(*) from base where not has_job),'noAcPo',(select count(*) from base where no_ac_po),
 'links',jsonb_build_object('byQuote',coalesce((select jsonb_object_agg(pg.quote_no,jsonb_build_object(
 'jobNos',(select coalesce(jsonb_agg(j.job_no),'[]'::jsonb) from job_orders j where j.quote_no=pg.quote_no),
 'invoiceNos',(select coalesce(jsonb_agg(i.invoice_no),'[]'::jsonb) from invoices i where i.quote_no=pg.quote_no and i.status<>'cancelled'),
 'receiptNos',(select coalesce(jsonb_agg(r.receipt_no),'[]'::jsonb) from receipts r where r.quote_no=pg.quote_no and r.status<>'cancelled'),
 'poNos',(select coalesce(jsonb_agg(po.po_no),'[]'::jsonb) from purchase_orders po where po.quote_no=pg.quote_no and po.status<>'cancelled'),
 'creditNos',(select coalesce(jsonb_agg(a.note_no),'[]'::jsonb) from adjustment_notes a left join invoices i on i.invoice_no=a.invoice_no left join receipts r on r.receipt_no=a.receipt_no where coalesce(a.quote_no,i.quote_no,r.quote_no)=pg.quote_no and a.kind<>'debit' and a.status<>'cancelled'),
 'debitNos',(select coalesce(jsonb_agg(a.note_no),'[]'::jsonb) from adjustment_notes a left join invoices i on i.invoice_no=a.invoice_no left join receipts r on r.receipt_no=a.receipt_no where coalesce(a.quote_no,i.quote_no,r.quote_no)=pg.quote_no and a.kind='debit' and a.status<>'cancelled')
 )) from page pg),'{}'::jsonb),
 'jobStatusBy',coalesce((select jsonb_object_agg(j.job_no,j.status) from job_orders j join page pg on pg.quote_no=j.quote_no),'{}'::jsonb))
);
$$;
revoke all on function public.quotation_page(text,date,date,text,text,text,text[],integer) from public,anon;
grant execute on function public.quotation_page(text,date,date,text,text,text,text[],integer) to authenticated;
