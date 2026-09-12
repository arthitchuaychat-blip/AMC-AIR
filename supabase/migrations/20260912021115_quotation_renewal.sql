create or replace function public.renew_quotation(p_quote_no text, p_valid_until date, p_reason text)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare q public.quotations%rowtype; who text;
begin
 if auth.uid() is null or not coalesce(public.app_can('quote',true),false) then raise exception 'ไม่มีสิทธิ์แก้ไขใบเสนอราคา' using errcode='42501'; end if;
 if p_valid_until is null or p_valid_until < (now() at time zone 'Asia/Bangkok')::date or not isfinite(p_valid_until) then raise exception 'วันยืนราคาใหม่ต้องเป็นวันนี้หรือวันถัดไป'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'กรุณาระบุเหตุผลที่ต่ออายุ'; end if;
 select * into q from public.quotations where quote_no=p_quote_no for update;
 if not found then raise exception 'ไม่พบใบเสนอราคาหรือไม่มีสิทธิ์'; end if;
 if q.status <> 'expired' then raise exception 'ใบนี้ไม่ได้อยู่ในสถานะหมดอายุ กรุณาโหลดใหม่'; end if;
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
