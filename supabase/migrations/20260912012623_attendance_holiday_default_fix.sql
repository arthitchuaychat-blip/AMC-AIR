CREATE OR REPLACE FUNCTION public.hr_att_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
begin
  if public.app_actor_role() in ('exec','admin') then return new; end if;
  if public.app_actor_role()='hr' and new.user_id<>auth.uid() then
    if tg_op='INSERT' then new.ot_ok:=null; new.hol_ok:=false; else new.ot_ok:=old.ot_ok; new.hol_ok:=old.hol_ok; end if;
    return new;
  end if;
  if tg_op='UPDATE' then
    new.user_id:=old.user_id; new.work_date:=old.work_date; new.hol_ok:=old.hol_ok;
  else new.hol_ok:=false; end if;
  if tg_op = 'INSERT' then
    new.ot_ok := null;
    new.work_date := (now() at time zone 'Asia/Bangkok')::date;
    if new.check_in_at is not null then
      new.client_in_at := new.check_in_at;
      new.skew_sec := round(extract(epoch from (new.check_in_at - now())))::int;
      new.check_in_at := now();
    end if;
    if new.check_out_at is not null then
      new.client_out_at := new.check_out_at;
      new.check_out_at := now();
    end if;
    return new;
  end if;
  new.ot_ok := old.ot_ok;
  if old.check_in_at is not null and new.check_in_at is distinct from old.check_in_at then
    raise exception 'แก้เวลาเช็คอินไม่ได้ — แจ้งฝ่ายบุคคลแก้ให้';
  end if;
  if old.check_out_at is not null and new.check_out_at is distinct from old.check_out_at then
    raise exception 'แก้เวลาเช็คเอาท์ไม่ได้ — แจ้งฝ่ายบุคคลแก้ให้';
  end if;
  if old.check_in_at is null and new.check_in_at is not null then
    new.client_in_at := new.check_in_at;
    new.skew_sec := round(extract(epoch from (new.check_in_at - now())))::int;
    new.check_in_at := now();
  end if;
  if old.check_out_at is null and new.check_out_at is not null then
    new.client_out_at := new.check_out_at;
    new.check_out_at := now();
  end if;
  return new;
end $function$;
