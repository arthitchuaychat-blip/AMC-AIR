-- Read-only verification against one active account per role/team combination.
-- No profile/job/document writes; no account names, IDs, team names or prices returned.
begin isolation level repeatable read read only;
set local statement_timeout='15s';
do $$
declare a record; expected text[]; actual text[]; payload jsonb; office jsonb; page jsonb;
  result jsonb := '[]'::jsonb; total_boq integer; field_actor boolean;
begin
  for a in select distinct on (role,coalesce(team,'')) id,role,team
           from public.profiles where active is true
           order by role,coalesce(team,''),id
  loop
    field_actor := a.role in ('tech','assistant','lead_tech');
    if field_actor then
      select coalesce(array_agg(j.job_no order by j.job_no),'{}'::text[]) into expected
      from public.job_orders j
      where a.role='lead_tech' or (a.team is not null and
        (j.assigned_team=a.team or exists(select 1 from public.job_visits v where v.job_no=j.job_no and v.assigned_team=a.team)));
    end if;
    perform set_config('request.jwt.claim.sub',a.id::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',a.id,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' then raise exception 'Verification role not active'; end if;
    if public.my_role() <> (case a.role when 'assistant' then 'tech' when 'field_sales' then 'sales' else a.role end)
      then raise exception 'Role normalization mismatch for %',a.role; end if;
    office := public.job_order_bundle()::jsonb;
    if field_actor then
      if exists(select 1 from public.job_orders) or exists(select 1 from public.quotation_items) or exists(select 1 from public.quotations)
        then raise exception 'Raw financial access exposed for %',a.role; end if;
      payload := public.jobs_for_team()::jsonb;
      select coalesce(array_agg(j->>'job_no' order by j->>'job_no'),'{}'::text[]) into actual from jsonb_array_elements(payload) j;
      if actual is distinct from expected then raise exception 'Safe job visibility mismatch for %',a.role; end if;
      select coalesce(array_agg(job_no order by job_no),'{}'::text[]) into actual from public.job_field_refs();
      if actual is distinct from expected then raise exception 'Reference visibility mismatch for %',a.role; end if;
      if exists(select 1 from public.job_visits where not(job_no=any(expected)))
        or exists(select 1 from public.job_logs where not(job_no=any(expected)))
        then raise exception 'Other-team rows exposed for %',a.role; end if;
      if exists(select 1 from jsonb_array_elements(payload) j where j ?| array['labor_total','labor_lines','internal_note','payout_id','rating','is_claim'])
        or exists(select 1 from jsonb_array_elements(payload) j cross join lateral jsonb_array_elements(j->'confirm_items') it
                  where it ?| array['unit_price','unit_cost','discount','price'])
        then raise exception 'Financial fields exposed for %',a.role; end if;
      if jsonb_array_length(office->'jobs')<>0 or jsonb_array_length(office->'items')<>0
        then raise exception 'Office bundle exposed for %',a.role; end if;
      if a.role in ('tech','assistant') then
        select coalesce(array_agg(j->>'job_no' order by j->>'job_no'),'{}'::text[]) into actual
        from jsonb_array_elements(public.jobs_for_team('__not_the_actor_team__')::jsonb) j;
        if actual is distinct from expected then raise exception 'Forged team accepted for %',a.role; end if;
      end if;
    elsif a.role in ('exec','admin','finance','sales','field_sales','stock','graphic') then
      if jsonb_array_length(office->'jobs') <> (select count(*) from public.job_orders)
        then raise exception 'Office bundle omits authorized jobs for %',a.role; end if;
    end if;
    page := public.boq_page();
    select count(*) into total_boq from public.boqs;
    if (page->>'total')::integer<>total_boq or jsonb_array_length(page->'rows')<>least(total_boq,50)
      then raise exception 'BOQ page/count mismatch for %',a.role; end if;
    result := result || jsonb_build_array(jsonb_build_object('role',a.role,'field_scope_checked',field_actor,
      'visible_jobs',case when field_actor then cardinality(expected) else jsonb_array_length(office->'jobs') end,
      'boq_total',total_boq,'boq_page_rows',jsonb_array_length(page->'rows'),'passed',true));
    execute 'reset role';
  end loop;
  if jsonb_array_length(result)=0 then raise exception 'No active accounts were verified'; end if;
  perform set_config('amc.v836_verification',result::text,true);
end $$;
select current_setting('amc.v836_verification')::jsonb as verification;
rollback;
