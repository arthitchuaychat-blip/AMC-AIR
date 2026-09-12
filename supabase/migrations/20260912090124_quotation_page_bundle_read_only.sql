create or replace function public.quotation_page_bundle(p_search text default '',p_from date default null,p_to date default null,p_status text default 'all',p_vat text default 'all',p_creator text default '',p_docs text[] default '{}',p_offset integer default 0)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with page as materialized (select public.quotation_page(p_search,p_from,p_to,p_status,p_vat,p_creator,p_docs,p_offset) d),
heads as materialized (select q.* from quotations q where q.quote_no in(select jsonb_array_elements_text(d->'nos') from page))
select d || jsonb_build_object('bundle',jsonb_build_object(
'quotes',coalesce((select jsonb_agg(q) from heads q),'[]'::jsonb),
'items',coalesce((select jsonb_agg(i order by i.id) from quotation_items i where quote_no in(select quote_no from heads)),'[]'::jsonb),
'customers',coalesce((select jsonb_agg(c) from (select id,name,address,tax_id,branch,type from customers where id in(select customer_id from heads)) c),'[]'::jsonb),
'sites',coalesce((select jsonb_agg(s) from (select id,site_name,address,map_url,contact_name,phone from customer_sites where id in(select site_id from heads)) s),'[]'::jsonb),
'contacts',coalesce((select jsonb_agg(c order by c.id) from (select id,customer_id,name,phone from customer_contacts where customer_id in(select customer_id from heads)) c),'[]'::jsonb),
'jobs',coalesce((select jsonb_agg(j order by j.job_no) from (select job_no,quote_no,scheduled_at,status,assigned_team from job_orders where quote_no in(select quote_no from heads)) j),'[]'::jsonb),
'invoices',coalesce((select jsonb_agg(i) from (select quote_no,total,status from invoices where quote_no in(select quote_no from heads)) i),'[]'::jsonb),
'creators',coalesce((select jsonb_object_agg(p.id::text,p.name) from profiles p where id in(select created_by from heads)),'{}'::jsonb)
)) from page;
$$;
revoke all on function public.quotation_page_bundle(text,date,date,text,text,text,text[],integer) from public,anon;
grant execute on function public.quotation_page_bundle(text,date,date,text,text,text,text[],integer) to authenticated;

create or replace function public.renew_quotation(p_quote_no text, p_valid_until date, p_reason text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare q public.quotations%rowtype; who text;
begin
 if auth.uid() is null or not coalesce(public.app_can('quote',true),false) then raise exception 'ไม่มีสิทธิ์แก้ไขใบเสนอราคา' using errcode='42501'; end if;
 if p_valid_until is null or p_valid_until < (now() at time zone 'Asia/Bangkok')::date or not isfinite(p_valid_until) then raise exception 'วันยืนราคาใหม่ต้องเป็นวันนี้หรือวันถัดไป'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'กรุณาระบุเหตุผลที่ต่ออายุ'; end if;
 select * into q from public.quotations where quote_no=p_quote_no for update;
 if not found then raise exception 'ไม่พบใบเสนอราคาหรือไม่มีสิทธิ์'; end if;
 if q.status <> 'expired' and not coalesce(q.status in ('draft','sent') and q.valid_until < (now() at time zone 'Asia/Bangkok')::date,false) then raise exception 'ใบนี้ไม่ได้อยู่ในสถานะหมดอายุ กรุณาโหลดใหม่'; end if;
 if exists(select 1 from public.invoices where quote_no=p_quote_no and status<>'cancelled')
 or exists(select 1 from public.job_orders where quote_no=p_quote_no and status<>'cancelled') then raise exception 'มีใบงานหรือใบแจ้งหนี้แล้ว กรุณาตรวจสอบเอกสารที่เชื่อมโยงก่อน'; end if;
 update public.quotations set status='sent',valid_until=p_valid_until,approved_at=null where quote_no=p_quote_no;
 if not found then raise exception 'ไม่มีสิทธิ์ต่ออายุใบเสนอราคา' using errcode='42501'; end if;
 select name into who from public.profiles where id=auth.uid();
 insert into public.audit_logs(actor,actor_name,action,target_type,target_no,reason,snapshot)
 values(auth.uid(),who,'status_change','quotation',p_quote_no,left('ต่ออายุใบเสนอราคา: '||trim(p_reason),500),
 jsonb_build_object('before',to_jsonb(q),'after',jsonb_build_object('status','sent','valid_until',p_valid_until,'approved_at',null)));
end $$;
revoke all on function public.renew_quotation(text,date,text) from public,anon;
grant execute on function public.renew_quotation(text,date,text) to authenticated;
