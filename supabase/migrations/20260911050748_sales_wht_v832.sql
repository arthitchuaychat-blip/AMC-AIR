-- v832: service-only corporate WHT, immutable accounting/export boundaries, evidence registry.
-- No historical financial rows are rewritten. Apply before deploying the v832 application.
alter table public.invoices add column if not exists wht_enabled boolean;
alter table public.adjustment_notes add column if not exists wht_enabled boolean;
alter table public.receipts add column if not exists paid_on date;

create table public.sales_wht_evidence (
 receipt_no text primary key references public.receipts(receipt_no) on delete restrict,
 certificate_no text not null default '', certificate_date date, received_on date,
 method text not null default 'paper' check(method in ('paper','ewht')),
 withheld_amount numeric(14,2) not null check(withheld_amount>=0),
 status text not null default 'waiting' check(status in ('waiting','received','verified')),
 file_path text, note text not null default '',
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 verified_by uuid references auth.users(id), verified_at timestamptz
);
alter table public.sales_wht_evidence enable row level security;
revoke all on public.sales_wht_evidence from anon;
grant select,insert,update on public.sales_wht_evidence to authenticated;
create policy sales_wht_read on public.sales_wht_evidence for select to authenticated
 using(public.app_actor_role() in ('exec','admin','finance','sales','field_sales') and public.app_can('receipt'));
create policy sales_wht_insert on public.sales_wht_evidence for insert to authenticated
 with check(public.app_actor_role() in ('exec','admin','finance','sales','field_sales') and public.app_can('receipt',true));
create policy sales_wht_update on public.sales_wht_evidence for update to authenticated
 using(public.app_actor_role() in ('exec','admin','finance','sales','field_sales') and public.app_can('receipt',true))
 with check(public.app_actor_role() in ('exec','admin','finance','sales','field_sales') and public.app_can('receipt',true));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('sales-wht-evidence','sales-wht-evidence',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy sales_wht_files_read on storage.objects for select to authenticated
 using(bucket_id='sales-wht-evidence' and public.app_actor_role() in ('exec','admin','finance','sales','field_sales') and public.app_can('receipt'));
create policy sales_wht_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='sales-wht-evidence' and (storage.foldername(name))[1]=auth.uid()::text and public.app_actor_role() in ('exec','admin','finance','sales','field_sales') and public.app_can('receipt',true));
-- No overwrite/delete: retained evidence remains available for audit history.

create or replace function public.sales_wht_calc(p_items jsonb,p_base numeric,p_total numeric,p_type text,p_enabled boolean,p_rate numeric)
 returns jsonb language plpgsql immutable set search_path=public as $$
declare a numeric; s numeric; b numeric; w numeric; on_flag boolean:=coalesce(p_type='company' and p_enabled,false); its jsonb;
begin
 if p_rate is null or p_rate<0 or p_rate>100 or p_rate::text in ('NaN','Infinity','-Infinity') then raise exception 'อัตราหัก ณ ที่จ่ายต้องอยู่ระหว่าง 0–100%%'; end if;
 if p_base<0 or p_total<0 or p_base::text in ('NaN','Infinity','-Infinity') or p_total::text in ('NaN','Infinity','-Infinity') then raise exception 'ยอดเงินไม่ถูกต้อง'; end if;
 if jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' then raise exception 'รายการต้องเป็น array'; end if;
 if exists(select from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i where round(coalesce((i->>'amount')::numeric,0),2)<0 or coalesce(i->>'amount','0') in ('NaN','Infinity','-Infinity')) then raise exception 'ยอดบรรทัดต้องไม่ติดลบ'; end if;
 select coalesce(sum(round(coalesce((i->>'amount')::numeric,0),2)),0),coalesce(sum(case when i->>'kind'='service' then round(coalesce((i->>'amount')::numeric,0),2) else 0 end),0),coalesce(jsonb_agg(i || jsonb_build_object('amount',round(coalesce((i->>'amount')::numeric,0),2),'wht',on_flag and coalesce(i->>'kind'='service',false))),'[]')
 into a,s,its from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) i;
 b:=case when on_flag and a>0 then round(coalesce(p_base,0)*greatest(0,least(1,s/a)),2) else 0 end;
 w:=round(b*p_rate/100,2);
 return jsonb_build_object('items',its,'enabled',on_flag,'base',b,'amount',w,'net',round(coalesce(p_total,0)-w,2));
end $$;
revoke all on function public.sales_wht_calc(jsonb,numeric,numeric,text,boolean,numeric) from public;
grant execute on function public.sales_wht_calc(jsonb,numeric,numeric,text,boolean,numeric) to authenticated,service_role;

create or replace function public.sales_wht_normalize_items(p_items jsonb,p_quote_no text)
 returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(i.value || jsonb_build_object('kind',coalesce(nullif(i.value->>'kind',''),q.kind,'unknown')) order by i.ordinality),'[]'::jsonb)
 from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) with ordinality i
 left join lateral (select kind from quotation_items q where q.quote_no=p_quote_no and ((coalesce(i.value->>'code','')<>'' and q.item_code=i.value->>'code') or (coalesce(i.value->>'code','')='' and q.name=i.value->>'name')) order by q.id limit 1) q on true
$$;
revoke all on function public.sales_wht_normalize_items(jsonb,text) from public,anon,authenticated;

create or replace function public.sales_wht_document_guard() returns trigger
 language plpgsql security definer set search_path=public as $$
declare n jsonb; o jsonb; financial boolean:=true; ct text; enabled boolean; result jsonb; docno text; reason text:=nullif(current_setting('app.sales_wht_reason',true),''); locked boolean:=false; module text;
begin
 if tg_op='DELETE' then n:=to_jsonb(old); else n:=to_jsonb(new); end if;
 if tg_op in ('UPDATE','DELETE') then o:=to_jsonb(old); end if;
 module:=case tg_table_name when 'invoices' then 'invoice' when 'receipts' then 'receipt' else 'adjnote' end;
 docno:=coalesce(n->>'receipt_no',n->>'invoice_no',n->>'note_no');
 if tg_table_name='adjustment_notes' then docno:=n->>'note_no'; end if;
 if tg_table_name='invoices' then docno:=n->>'invoice_no'; end if;
 if tg_table_name='receipts' and tg_op='UPDATE' and ((n->'flowaccount_id',n->'flowaccount_no',n->'flowaccount_at') is distinct from (o->'flowaccount_id',o->'flowaccount_no',o->'flowaccount_at')) and coalesce(current_setting('app.sales_flowaccount',true),'')<>'rpc' then raise exception 'เปลี่ยนเลขส่งบัญชีผ่านขั้นตอนส่งเอกสารเท่านั้น'; end if;
 if tg_op='INSERT' and tg_table_name='receipts' then
  if n->>'flowaccount_id' is not null or n->>'flowaccount_no' is not null or n->>'flowaccount_at' is not null then raise exception 'ใบใหม่ต้องส่งบัญชีผ่านขั้นตอนส่งเอกสาร'; end if;
  perform 1 from invoices where invoice_no=n->>'invoice_no' for update;
  if not found then raise exception 'ไม่พบใบแจ้งหนี้'; end if;
 end if;
 if tg_op='UPDATE' then
  if (n->'receipt_no',n->'invoice_no',n->'note_no') is distinct from (o->'receipt_no',o->'invoice_no',o->'note_no') then raise exception 'เปลี่ยนเลขอ้างอิงเอกสารเดิมไม่ได้'; end if;
  select exists(select from unnest(array['base','vat_amt','total','wht_amt','wht_rate','net','items','customer_id','quote_no','invoice_no','wht','wht_enabled','issue_date','payment_method','paid_on']) k where n->k is distinct from o->k) into financial;
 end if;
 if tg_op in ('UPDATE','DELETE') and (financial or tg_op='DELETE' or (n->>'status'='cancelled' and o->>'status'<>'cancelled') or (o->>'status'='paid' and n->>'status' is distinct from 'paid')) then
  if tg_table_name='receipts' then
   locked:=o->>'flowaccount_at' is not null or o->>'flowaccount_id' is not null or o->>'flowaccount_no' is not null
    or exists(select from acc_journal where ref_type='receipt' and ref_no=docno and status<>'void')
    or exists(select from account_entries where ref_type='receipt' and ref_id=docno and reconciled)
    or exists(select from sales_wht_evidence where receipt_no=docno and status='verified');
  elsif tg_table_name='invoices' then
   locked:=exists(select from receipts where invoice_no=docno and status<>'cancelled')
    or exists(select from billing_notes where docno=any(invoice_nos) and status<>'cancelled')
    or exists(select from acc_journal where ref_type='invoice' and ref_no=docno and status<>'void');
  else
   locked:=exists(select from acc_journal where ref_type='adjustment_note' and ref_no=docno and status<>'void');
  end if;
  if locked then raise exception 'เอกสารถูกส่งบัญชี/กระทบยอด/ตรวจหลักฐาน หรือมีเอกสารต่อแล้ว ให้ฝ่ายบัญชีทำรายการปรับปรุงก่อนแก้ไข'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 if financial then
  if abs(coalesce((n->>'total')::numeric,0)-coalesce((n->>'base')::numeric,0)-coalesce((n->>'vat_amt')::numeric,0))>0.01 then raise exception 'ยอดก่อน VAT + VAT ต้องตรงกับยอดรวม'; end if;
  if tg_op='UPDATE' and tg_table_name<>'adjustment_notes' and ((n->'wht_amt' is distinct from o->'wht_amt') or (n->'wht_rate' is distinct from o->'wht_rate') or (n->'wht' is distinct from o->'wht') or (n->'wht_enabled' is distinct from o->'wht_enabled')) and reason is null then raise exception 'เปลี่ยนเงื่อนไขหักภาษีผ่านหน้าปรับเงื่อนไขพร้อมระบุเหตุผล'; end if;
  select type into ct from customers where id=(n->>'customer_id')::bigint;
  enabled:=coalesce((n->>'wht_enabled')::boolean,(n->>'wht')::boolean,(n->>'wht_amt')::numeric>0,false);
  n:=jsonb_set(n,'{items}',public.sales_wht_normalize_items(n->'items',n->>'quote_no'));
  if enabled and ct='company' and exists(select from jsonb_array_elements(n->'items') i where i->>'kind'='unknown') then raise exception 'มีรายการเก่าที่ไม่ทราบหมวดสินค้า/บริการ ให้ตรวจต้นทางก่อนเปลี่ยนภาษี'; end if;
  result:=public.sales_wht_calc(n->'items',(n->>'base')::numeric,(n->>'total')::numeric,ct,enabled,coalesce((n->>'wht_rate')::numeric,3));
  n:=n || jsonb_build_object('items',result->'items','wht_amt',result->'amount');
  if tg_table_name='receipts' then n:=n || jsonb_build_object('wht',result->'enabled','net',result->'net');
  else n:=n || jsonb_build_object('wht_enabled',result->'enabled'); end if;
  if tg_table_name='adjustment_notes' then n:=n || jsonb_build_object('net',result->'net'); end if;
  if ct is distinct from 'company' then n:=n || jsonb_build_object('wht_rate',0); end if;
 end if;
 if tg_table_name='receipts' and n->>'status'='paid' then
  if tg_op='INSERT' then n:=n || jsonb_build_object('paid_on',coalesce(n->>'paid_on',n->>'issue_date',((now() at time zone 'Asia/Bangkok')::date)::text));
  elsif o->>'status' is distinct from 'paid' then n:=n || jsonb_build_object('paid_on',((now() at time zone 'Asia/Bangkok')::date)::text); end if;
 end if;
 if tg_op='UPDATE' and financial then
  insert into audit_logs(actor,action,target_type,target_no,reason,snapshot) values(auth.uid(),'edit',module,docno,coalesce(reason,n->>'reason','เปลี่ยนยอดเอกสารขาย'),jsonb_build_object('before',o,'after',n));
 end if;
 new:=jsonb_populate_record(new,n);
 return new;
end $$;
revoke all on function public.sales_wht_document_guard() from public,anon,authenticated;
create trigger sales_wht_guard before insert or update or delete on public.invoices for each row execute function public.sales_wht_document_guard();
create trigger sales_wht_guard before insert or update or delete on public.receipts for each row execute function public.sales_wht_document_guard();
create trigger sales_wht_guard before insert or update or delete on public.adjustment_notes for each row execute function public.sales_wht_document_guard();

create or replace function public.sales_wht_quote_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare ct text;
begin
 if tg_op='UPDATE' and (new.customer_id,new.wht,new.wht_rate) is not distinct from (old.customer_id,old.wht,old.wht_rate) then return new; end if;
 if tg_op='UPDATE' and exists(select from invoices where quote_no=old.quote_no and status<>'cancelled') then raise exception 'ใบเสนอราคามีใบแจ้งหนี้แล้ว เปลี่ยนเงื่อนไขภาษีไม่ได้'; end if;
 if new.wht_rate is null or new.wht_rate<0 or new.wht_rate>100 or new.wht_rate::text in ('NaN','Infinity','-Infinity') then raise exception 'อัตราหัก ณ ที่จ่ายต้องอยู่ระหว่าง 0–100%%'; end if;
 select type into ct from customers where id=new.customer_id;
 if ct is distinct from 'company' then new.wht:=false; new.wht_rate:=0; end if;
 return new;
end $$;
revoke all on function public.sales_wht_quote_guard() from public,anon,authenticated;
create trigger sales_wht_quote_guard before insert or update on public.quotations for each row execute function public.sales_wht_quote_guard();

create or replace function public.update_sales_wht(p_kind text,p_no text,p_enabled boolean,p_rate numeric,p_reason text)
 returns void language plpgsql security definer set search_path=public as $$
declare doc record; table_name text; key_name text; module text; before_row jsonb; after_row jsonb;
begin
 if p_kind not in ('invoice','receipt') then raise exception 'ประเภทเอกสารไม่ถูกต้อง'; end if;
 module:=p_kind;
 if auth.uid() is null or public.app_actor_role() not in ('exec','admin','finance','sales','field_sales') or not public.app_can(module,true) then raise exception 'ไม่มีสิทธิ์แก้เอกสาร' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'กรุณาระบุเหตุผล'; end if;
 if p_rate is null or p_rate<0 or p_rate>100 or p_rate::text in ('NaN','Infinity','-Infinity') then raise exception 'อัตราไม่ถูกต้อง'; end if;
 table_name:=case p_kind when 'invoice' then 'invoices' else 'receipts' end; key_name:=p_kind||'_no';
 execute format('select to_jsonb(t) from public.%I t where %I=$1 for update',table_name,key_name) into before_row using p_no;
 if before_row is null then raise exception 'ไม่พบเอกสาร'; end if;
 if before_row->>'status'='cancelled' then raise exception 'เอกสารยกเลิกแล้ว'; end if;
 perform set_config('app.sales_wht_reason',btrim(p_reason),true);
 execute format('update public.%I set %I=$2,wht_rate=$3 where %I=$1 returning to_jsonb(%I)',table_name,case p_kind when 'invoice' then 'wht_enabled' else 'wht' end,key_name,table_name) into after_row using p_no,p_enabled,p_rate;
end $$;
revoke all on function public.update_sales_wht(text,text,boolean,numeric,text) from public,anon;
grant execute on function public.update_sales_wht(text,text,boolean,numeric,text) to authenticated;

create or replace function public.sales_wht_evidence_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare r receipts%rowtype; actor_role text:=public.app_actor_role();
begin
 select * into r from receipts where receipt_no=new.receipt_no for update;
 if r.receipt_no is null or r.status='cancelled' or coalesce(r.wht_amt,0)<=0 then raise exception 'เอกสารนี้ไม่มีภาษีหักที่ต้องติดตาม'; end if;
 if tg_op='UPDATE' and new.receipt_no<>old.receipt_no then raise exception 'เปลี่ยนใบอ้างอิงไม่ได้'; end if;
 if tg_op='UPDATE' and old.status='verified' and actor_role not in ('exec','admin','finance') then raise exception 'ให้ฝ่ายบัญชีแก้หลักฐานที่ตรวจสอบแล้ว'; end if;
 if new.status in ('received','verified') and (nullif(btrim(new.certificate_no),'') is null or new.certificate_date is null or new.received_on is null or nullif(new.file_path,'') is null) then raise exception 'กรอกเลขหลักฐาน วันที่เอกสาร วันที่ได้รับ และแนบไฟล์ให้ครบ'; end if;
 if new.file_path is not null and not exists(select from storage.objects where bucket_id='sales-wht-evidence' and name=new.file_path) then raise exception 'ไม่พบไฟล์หลักฐาน'; end if;
 if new.status='verified' then
  if actor_role not in ('exec','admin','finance') then raise exception 'เฉพาะฝ่ายบัญชีหรือผู้บริหารตรวจสอบหลักฐานได้'; end if;
  if r.status<>'paid' or abs(new.withheld_amount-r.wht_amt)>0.01 then raise exception 'ต้องรับชำระแล้ว และยอดหลักฐานต้องตรงใบเสร็จ'; end if;
  new.verified_by:=auth.uid(); new.verified_at:=now();
 else new.verified_by:=null; new.verified_at:=null; end if;
 new.updated_by:=auth.uid(); new.updated_at:=now();
 insert into audit_logs(actor,action,target_type,target_no,reason,snapshot) values(auth.uid(),'edit','sales_wht_evidence',new.receipt_no,new.note,jsonb_build_object('before',case when tg_op='UPDATE' then to_jsonb(old) else null end,'after',to_jsonb(new)));
 return new;
end $$;
revoke all on function public.sales_wht_evidence_guard() from public,anon,authenticated;
create trigger sales_wht_evidence_guard before insert or update on public.sales_wht_evidence for each row execute function public.sales_wht_evidence_guard();

-- Sending sales documents must not grant the accounting module to sales staff.
create or replace function public.claim_receipt_flowaccount(p_receipt_no text) returns boolean language plpgsql security definer set search_path=public as $$
declare claimed int;
begin
 if auth.uid() is null or public.app_actor_role() not in ('exec','admin','finance','sales','field_sales') or not public.app_can('receipt',true) then raise exception 'ไม่มีสิทธิ์ส่งเอกสารขาย' using errcode='42501'; end if;
 perform set_config('app.sales_flowaccount','rpc',true);
 update receipts set flowaccount_at=now() where receipt_no=p_receipt_no and status<>'cancelled' and vat_amt>0 and flowaccount_id is null and flowaccount_no is null and flowaccount_at is null;
 get diagnostics claimed=row_count; return claimed>0;
end $$;
create or replace function public.release_receipt_flowaccount(p_receipt_no text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or public.app_actor_role() not in ('exec','admin','finance','sales','field_sales') or not public.app_can('receipt',true) then raise exception 'ไม่มีสิทธิ์ส่งเอกสารขาย' using errcode='42501'; end if;
 perform set_config('app.sales_flowaccount','rpc',true);
 update receipts set flowaccount_at=null where receipt_no=p_receipt_no and flowaccount_id is null and flowaccount_no is null;
end $$;
create or replace function public.set_receipt_flowaccount(p_receipt_no text,p_fa_id text,p_fa_no text) returns boolean language plpgsql security definer set search_path=public as $$
declare done int;
begin
 if auth.uid() is null or public.app_actor_role() not in ('exec','admin','finance','sales','field_sales') or not public.app_can('receipt',true) then raise exception 'ไม่มีสิทธิ์ส่งเอกสารขาย' using errcode='42501'; end if;
 if nullif(p_fa_id,'') is null and nullif(p_fa_no,'') is null then raise exception 'ต้องระบุเลขอ้างอิง FlowAccount'; end if;
 perform set_config('app.sales_flowaccount','rpc',true);
 update receipts set flowaccount_id=nullif(p_fa_id,''),flowaccount_no=nullif(p_fa_no,''),flowaccount_at=now() where receipt_no=p_receipt_no and flowaccount_id is null and flowaccount_no is null and flowaccount_at is not null;
 get diagnostics done=row_count; return done>0;
end $$;
revoke all on function public.claim_receipt_flowaccount(text),public.release_receipt_flowaccount(text),public.set_receipt_flowaccount(text,text,text) from public,anon;
grant execute on function public.claim_receipt_flowaccount(text),public.release_receipt_flowaccount(text),public.set_receipt_flowaccount(text,text,text) to authenticated;

create or replace function public.clear_sales_flowaccount_placeholder(p_receipt_no text) returns boolean language plpgsql security definer set search_path=public as $$
declare done int;
begin
 if auth.uid() is null or public.app_actor_role() not in ('exec','admin','finance') then raise exception 'ให้ฝ่ายบัญชีตรวจเอกสารก่อนปลดเลขอ้างอิง' using errcode='42501'; end if;
 perform set_config('app.sales_flowaccount','rpc',true);
 update receipts set flowaccount_no=null,flowaccount_at=null where receipt_no=p_receipt_no and flowaccount_id is null;
 get diagnostics done=row_count;
 if done>0 then insert into audit_logs(actor,action,target_type,target_no,reason) values(auth.uid(),'edit','receipt',p_receipt_no,'ฝ่ายบัญชีปลดเลขอ้างอิง FlowAccount ที่ไม่มีรหัสเอกสารจริง'); end if;
 return done>0;
end $$;
revoke all on function public.clear_sales_flowaccount_placeholder(text) from public,anon;
grant execute on function public.clear_sales_flowaccount_placeholder(text) to authenticated;

create or replace function public.sales_wht_locks() returns table(kind text,document_no text) language sql stable security definer set search_path=public as $$
 select 'receipt'::text,r.receipt_no from receipts r
 where public.app_actor_role() in ('exec','admin','finance','sales','field_sales') and public.app_can('receipt')
 and (r.status='cancelled' or r.flowaccount_at is not null or r.flowaccount_id is not null or r.flowaccount_no is not null
 or exists(select from acc_journal j where j.ref_type='receipt' and j.ref_no=r.receipt_no and j.status<>'void')
 or exists(select from account_entries e where e.ref_type='receipt' and e.ref_id=r.receipt_no and e.reconciled)
 or exists(select from sales_wht_evidence e where e.receipt_no=r.receipt_no and e.status='verified'))
 union all
 select 'invoice'::text,i.invoice_no from invoices i
 where public.app_actor_role() in ('exec','admin','finance','sales','field_sales') and public.app_can('invoice')
 and (i.status='cancelled' or exists(select from receipts r where r.invoice_no=i.invoice_no and r.status<>'cancelled')
 or exists(select from billing_notes b where i.invoice_no=any(b.invoice_nos) and b.status<>'cancelled')
 or exists(select from acc_journal j where j.ref_type='invoice' and j.ref_no=i.invoice_no and j.status<>'void'))
$$;
revoke all on function public.sales_wht_locks() from public,anon;
grant execute on function public.sales_wht_locks() to authenticated;
