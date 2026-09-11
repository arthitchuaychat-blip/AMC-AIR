-- Emergency compatibility rollback after restoring the v831 app commit.
-- Retains evidence, private storage, columns, and audit history. No customer rows deleted.
begin;
drop trigger if exists sales_wht_guard on public.invoices;
drop trigger if exists sales_wht_guard on public.receipts;
drop trigger if exists sales_wht_guard on public.adjustment_notes;
drop trigger if exists sales_wht_quote_guard on public.quotations;
CREATE OR REPLACE FUNCTION public.claim_receipt_flowaccount(p_receipt_no text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare claimed int;
begin
 if auth.role() is distinct from 'service_role' and not public.app_can('accounting',true) then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  update receipts set flowaccount_at = now()
   where receipt_no = p_receipt_no
     and flowaccount_id is null
     and flowaccount_at is null;
  get diagnostics claimed = row_count;
  return claimed > 0;
end; $function$
;

revoke all on function public.claim_receipt_flowaccount(p_receipt_no text) from public,anon; grant execute on function public.claim_receipt_flowaccount(p_receipt_no text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.release_receipt_flowaccount(p_receipt_no text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
 if auth.role() is distinct from 'service_role' and not public.app_can('accounting',true) then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  update receipts set flowaccount_at = null
   where receipt_no = p_receipt_no and flowaccount_id is null;
end; $function$
;

revoke all on function public.release_receipt_flowaccount(p_receipt_no text) from public,anon; grant execute on function public.release_receipt_flowaccount(p_receipt_no text) to authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare done int;
begin
 if auth.role() is distinct from 'service_role' and not public.app_can('accounting',true) then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  update receipts
     set flowaccount_id = nullif(p_fa_id, ''),
         flowaccount_no = nullif(p_fa_no, ''),
         flowaccount_at = now()
   where receipt_no = p_receipt_no
     and flowaccount_id is null;
  get diagnostics done = row_count;
  return done > 0;
end; $function$
;

revoke all on function public.set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text) from public,anon; grant execute on function public.set_receipt_flowaccount(p_receipt_no text, p_fa_id text, p_fa_no text) to authenticated,service_role;

commit;
