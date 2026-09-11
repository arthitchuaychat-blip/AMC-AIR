-- Stop automatic calculation without deleting selected contracts or saved labor.
drop trigger if exists job_contract_visit_changed on public.job_visits;
drop trigger if exists job_contract_job_changed on public.job_orders;
drop trigger if exists job_contract_defaults on public.job_orders;
drop function if exists public.job_contract_changed();
drop function if exists public.recalculate_job_contract(text);
drop function if exists public.job_contract_defaults();
