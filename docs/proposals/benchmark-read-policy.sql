-- Transactional benchmark only. Proposal is NOT applied persistently.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','dc55c62e-56a7-46e6-95eb-c37c2f8c791a',true);
do $$ declare t timestamptz; d jsonb; times numeric[]:='{}';
begin
 for n in 1..5 loop
 t:=clock_timestamp(); d:=quotation_page_bundle(); times:=array_append(times,extract(epoch from clock_timestamp()-t)*1000);
 end loop;
 perform set_config('amc.before_rls',jsonb_build_object('ms',times,'total',d->'total','nos',d->'nos','statuses',d->'statuses','bytes',octet_length(d::text))::text,true);
end $$;
reset role;
-- Cache the existing STABLE, row-independent role lookup once per statement.
-- Preserve every policy role, predicate, command and restrictive policy.
alter policy "audit_read" on public."audit_logs" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text])));
alter policy "boqi_read" on public."boq_items" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'stock'::text, 'hr'::text])));
alter policy "boq_read" on public."boqs" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'stock'::text, 'hr'::text])));
alter policy "cn_read" on public."chat_notes" using ((chat_is_member(room_id) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text]))));
alter policy "cr_read" on public."chat_rooms" using (((kind = 'company'::text) OR chat_is_member(id) OR ((kind = ANY (ARRAY['group'::text, 'project'::text])) AND ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text])))));
alter policy "email_messages_read" on public."email_messages" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text, 'sales'::text, 'field_sales'::text, 'graphic'::text])));
alter policy "email_threads_read" on public."email_threads" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text, 'sales'::text, 'field_sales'::text, 'graphic'::text])));
alter policy "er_read" on public."expense_requests" using (((requester = auth.uid()) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'hr'::text]))));
alter policy "fb_contacts_read" on public."fb_contacts" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'lead_tech'::text, 'hr'::text])));
alter policy "fb_messages_read" on public."fb_messages" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'lead_tech'::text, 'hr'::text])));
alter policy "handbook_ack_read" on public."handbook_ack" using (((user_id = auth.uid()) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))));
alter policy "hr_loans_sel" on public."hr_loans" using (((user_id = auth.uid()) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text, 'finance'::text]))));
alter policy "hr_ot_sel" on public."hr_ot" using (((user_id = auth.uid()) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))));
alter policy "hr_pay_read" on public."hr_pay" using (((user_id = auth.uid()) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text, 'finance'::text]))));
alter policy "hr_profiles_read" on public."hr_profiles" using (((user_id = auth.uid()) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'hr'::text]))));
alter policy "job_handovers_read" on public."job_handovers" using (((created_by = auth.uid()) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'sales'::text, 'finance'::text, 'lead_tech'::text, 'hr'::text, 'stock'::text]))));
alter policy "lcc_read" on public."line_contact_customers" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'lead_tech'::text, 'hr'::text])));
alter policy "lc_read" on public."line_contacts" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'lead_tech'::text, 'hr'::text])));
alter policy "lm_read" on public."line_messages" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'lead_tech'::text, 'hr'::text])));
alter policy "poi_sel" on public."po_items" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'stock'::text, 'sales'::text, 'hr'::text])));
alter policy "promo_coup_read" on public."promo_coupons" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'field_sales'::text, 'stock'::text, 'hr'::text])));
alter policy "po_sel" on public."purchase_orders" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'stock'::text, 'sales'::text, 'hr'::text])));
alter policy "qr_read" on public."quick_replies" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'lead_tech'::text, 'hr'::text])));
alter policy "qti_read" on public."quotation_items" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'stock'::text, 'hr'::text])));
alter policy "qt_read" on public."quotations" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'stock'::text, 'hr'::text])));
alter policy "sci_read" on public."stock_count_items" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'stock'::text])));
alter policy "sc_read" on public."stock_counts" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'stock'::text])));
alter policy "sub_payouts_read" on public."sub_payouts" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'sales'::text, 'hr'::text])));
alter policy "txn_read" on public."transactions" using ((((select public.my_role()) = ANY (ARRAY['admin'::text, 'exec'::text, 'finance'::text, 'stock'::text, 'sales'::text, 'lead_tech'::text, 'hr'::text])) OR (team = my_team())));
alter policy "wad_read" on public."web_ads" using (((active = true) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'graphic'::text]))));
alter policy "wcnt_read" on public."web_articles" using (((active = true) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'graphic'::text]))));
alter policy "wb_read" on public."web_banners" using (((active = true) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'graphic'::text]))));
alter policy "wc_read" on public."web_clients" using (((active = true) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'graphic'::text]))));
alter policy "web_orders_read" on public."web_orders" using (((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'hr'::text, 'graphic'::text])));
alter policy "wcnt_read" on public."web_portfolio" using (((active = true) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'graphic'::text]))));
alter policy "wcnt_read" on public."web_press" using (((active = true) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'finance'::text, 'graphic'::text]))));
alter policy "wrev_read" on public."web_reviews" using (((active = true) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'graphic'::text, 'finance'::text]))));
alter policy "wsvc_read" on public."web_services" using (((active = true) OR ((select public.my_role()) = ANY (ARRAY['admin'::text, 'sales'::text, 'exec'::text, 'graphic'::text, 'finance'::text]))));

set local role authenticated;
select set_config('request.jwt.claim.sub','dc55c62e-56a7-46e6-95eb-c37c2f8c791a',true);
do $$ declare t timestamptz; d jsonb; times numeric[]:='{}';
begin
 for n in 1..5 loop
 t:=clock_timestamp(); d:=quotation_page_bundle(); times:=array_append(times,extract(epoch from clock_timestamp()-t)*1000);
 end loop;
 perform set_config('amc.after_rls',jsonb_build_object('ms',times,'total',d->'total','nos',d->'nos','statuses',d->'statuses','bytes',octet_length(d::text))::text,true);
end $$;
reset role;
select jsonb_build_object('before_ms',current_setting('amc.before_rls')::jsonb->'ms','after_ms',current_setting('amc.after_rls')::jsonb->'ms','same_total',(current_setting('amc.before_rls')::jsonb->'total')=(current_setting('amc.after_rls')::jsonb->'total'),'same_page',(current_setting('amc.before_rls')::jsonb->'nos')=(current_setting('amc.after_rls')::jsonb->'nos'),'same_statuses',(current_setting('amc.before_rls')::jsonb->'statuses')=(current_setting('amc.after_rls')::jsonb->'statuses')) as measurement;
rollback;
