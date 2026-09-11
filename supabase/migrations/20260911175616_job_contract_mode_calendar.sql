alter table public.job_orders
 add column if not exists labor_mode text check (labor_mode in ('labor','inclusive','daily')),
 add column if not exists labor_rate_config jsonb,
 add column if not exists labor_manual boolean not null default false,
 add column if not exists labor_review_required boolean not null default false,
 add column if not exists labor_calendar_days integer not null default 0;

-- Internal helpers are trigger-only: no callable financial RPC is exposed.
create or replace function public.job_contract_defaults() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_op='UPDATE' and (coalesce(old.labor_confirmed,false) or coalesce(old.labor_paid_amt,0)>0) and (new.labor_total is distinct from old.labor_total or new.labor_lines is distinct from old.labor_lines) then
  raise exception 'ค่าแรงยืนยันหรือจัดจ่ายแล้ว ไม่สามารถเปลี่ยนยอดได้';
 end if;
 if tg_op='UPDATE' and new.labor_confirmed and not coalesce(old.labor_confirmed,false) and new.labor_review_required then
  raise exception 'โปรดตรวจสอบค่าแรงหลังแผนงานหรือข้อมูลเปลี่ยนก่อนยืนยัน';
 end if;
 if new.labor_mode is not null and (new.labor_rate_config is null or (tg_op='UPDATE' and new.labor_mode is distinct from old.labor_mode)) then
  select value into new.labor_rate_config from app_config where key='subcontractor_rates';
  new.labor_rate_config := coalesce(new.labor_rate_config,'{"labor":45,"material":10,"inclusive":65,"cleaning":70,"daily":2000,"mode":"labor"}'::jsonb);
  if tg_op='UPDATE' and old.labor_mode is null and coalesce(old.labor_total,0)>0 then new.labor_manual:=true; end if;
 end if;
 return new;
end $$;
revoke all on function public.job_contract_defaults() from public,anon,authenticated;
create trigger job_contract_defaults before insert or update of labor_mode,labor_rate_config,labor_confirmed,labor_total,labor_lines on public.job_orders
 for each row execute function public.job_contract_defaults();

create or replace function public.recalculate_job_contract(p_job text) returns void
language plpgsql security definer set search_path=public as $$
declare j job_orders%rowtype; cfg jsonb; result jsonb:='[]'; total numeric:=0; days integer:=0; q quotations%rowtype; subtotal numeric:=0; disc numeric:=0; item record; line_sale numeric; base numeric; pct numeric; grp text; missing boolean:=false;
begin
 select * into j from job_orders where job_no=p_job for update;
 if not found or j.labor_mode is null then return; end if;
 if not exists(select 1 from teams where id=j.assigned_team and type='sub') then return; end if;
 cfg:=j.labor_rate_config;
 if j.labor_mode='daily' then
  select count(distinct d::date) into days from job_visits v
   cross join lateral generate_series(v.visit_date::timestamp,greatest(v.visit_date,coalesce(v.end_date,v.visit_date))::timestamp,interval '1 day') d
   where v.job_no=p_job and coalesce(v.status,'scheduled')<>'cancelled'
    and coalesce(v.assigned_team,j.assigned_team)=j.assigned_team;
  total:=round(days*coalesce((cfg->>'daily')::numeric,2000),2);
  result:=jsonb_build_array(jsonb_build_object('name','ค่าแรงรายวันตามปฏิทิน','qty',days,'unit','วัน/ทีม','price',coalesce((cfg->>'daily')::numeric,2000),'sale',0,'labor',total,'manual',true,'contract_mode','daily','rate_snapshot',cfg));
 else
  select * into q from quotations where quote_no=j.quote_no;
  select coalesce(sum(greatest(0,round(qty*(case when q.pay_method='card_full' then ceil(unit_price*1.04) when q.pay_method='card_inst10' then ceil(unit_price*1.14) else unit_price end)-coalesce(discount,0),2))),0)
   into subtotal from quotation_items where quote_no=j.quote_no;
  disc:=least(subtotal,greatest(0,case when q.discount_type='percent' then subtotal*coalesce(q.discount_value,0)/100 else coalesce(q.discount_value,0) end));
  for item in select it.*,m.kind as catalog_kind,m.category,c.mat_group,c.name_th as category_name,m.code as catalog_code
   from quotation_items it left join materials m on m.code=it.item_code left join categories c on c.id=m.category
   where it.quote_no=j.quote_no order by it.id loop
   grp:=case when coalesce(item.catalog_kind,item.kind)='ac' then 'excluded'
    when item.mat_group in ('part','accessory','spare') or item.category_name ~ '(อะไหล่|อุปกรณ์เสริม)' then 'excluded'
    when coalesce(item.catalog_kind,item.kind)='service' then case when item.category='sv-clean' or j.job_type='maintenance' then 'cleaning' else 'service' end
    when item.catalog_code is not null and item.catalog_kind='material' then 'material' else 'unknown' end;
   if grp='unknown' then missing:=true; end if;
   pct:=case when grp in ('excluded','unknown') then 0 when j.labor_mode='inclusive' then coalesce((cfg->>'inclusive')::numeric,65)
    when grp='material' then coalesce((cfg->>'material')::numeric,10) when grp='cleaning' then coalesce((cfg->>'cleaning')::numeric,70) else coalesce((cfg->>'labor')::numeric,45) end;
   line_sale:=greatest(0,round(item.qty*(case when q.pay_method='card_full' then ceil(item.unit_price*1.04) when q.pay_method='card_inst10' then ceil(item.unit_price*1.14) else item.unit_price end)-coalesce(item.discount,0),2));
   base:=case when subtotal>0 then line_sale*(1-disc/subtotal) else 0 end;
   result:=result||jsonb_build_array(jsonb_build_object('code',item.item_code,'name',item.name,'qty',item.qty,'unit',item.unit,'price',item.unit_price,'disc',item.discount,'sale',line_sale,'labor',round(base*pct/100,2),'labor_group',grp,'contract_mode',j.labor_mode,'applied_rate',pct,'rate_snapshot',cfg));
   total:=total+round(base*pct/100,2);
  end loop;
 end if;
 if j.labor_manual or coalesce(j.labor_confirmed,false) or coalesce(j.labor_paid_amt,0)>0 then
  update job_orders set labor_calendar_days=days,labor_review_required=(missing or coalesce(labor_total,0)<>total) where job_no=p_job;
 else
  update job_orders set labor_lines=result,labor_total=total,labor_calendar_days=days,labor_review_required=missing where job_no=p_job;
 end if;
end $$;
revoke all on function public.recalculate_job_contract(text) from public,anon,authenticated;

create or replace function public.job_contract_changed() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='job_visits' then
  if tg_op in ('DELETE','UPDATE') then perform recalculate_job_contract(old.job_no); end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.job_no is distinct from old.job_no) then perform recalculate_job_contract(new.job_no); end if;
 else
  if tg_op='UPDATE' and new.labor_manual and new.labor_mode is not distinct from old.labor_mode and new.labor_rate_config is not distinct from old.labor_rate_config and new.quote_no is not distinct from old.quote_no and new.assigned_team is not distinct from old.assigned_team and new.job_type is not distinct from old.job_type then return null; end if;
  perform recalculate_job_contract(new.job_no);
 end if;
 return null;
end $$;
revoke all on function public.job_contract_changed() from public,anon,authenticated;
create trigger job_contract_job_changed after insert or update of labor_mode,labor_rate_config,labor_manual,quote_no,assigned_team,job_type on public.job_orders
 for each row execute function public.job_contract_changed();
create trigger job_contract_visit_changed after insert or update or delete on public.job_visits
 for each row execute function public.job_contract_changed();
