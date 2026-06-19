-- 047_chat_groups.sql — two auto-maintained team-chat groups: "พนักงานประจำ" vs "ช่างซัพ".
-- A profile is "sub" if its team is a sub-type team; everyone else is permanent.
-- chat_sync_groups() (admin/exec) creates the rooms if missing and reconciles membership.

create or replace function chat_sync_groups() returns void
language plpgsql security definer set search_path = public as $$
declare v_perm bigint; v_sub bigint;
begin
  if my_role() not in ('admin','exec') then raise exception 'forbidden'; end if;

  select id into v_perm from chat_rooms where ref_type = 'autogroup' and ref_no = 'permanent' limit 1;
  if v_perm is null then
    insert into chat_rooms(kind, name, ref_type, ref_no, created_by)
      values ('group', 'พนักงานประจำ', 'autogroup', 'permanent', auth.uid()) returning id into v_perm;
  end if;

  select id into v_sub from chat_rooms where ref_type = 'autogroup' and ref_no = 'sub' limit 1;
  if v_sub is null then
    insert into chat_rooms(kind, name, ref_type, ref_no, created_by)
      values ('group', 'ช่างซัพ', 'autogroup', 'sub', auth.uid()) returning id into v_sub;
  end if;

  -- add sub-team people to the sub room
  insert into chat_members(room_id, user_id)
    select v_sub, p.id from profiles p
     join teams t on t.id = p.team and t.type = 'sub'
    where not exists (select 1 from chat_members m where m.room_id = v_sub and m.user_id = p.id);

  -- add everyone else to the permanent room
  insert into chat_members(room_id, user_id)
    select v_perm, p.id from profiles p
    where not exists (select 1 from teams t where t.id = p.team and t.type = 'sub')
      and not exists (select 1 from chat_members m where m.room_id = v_perm and m.user_id = p.id);

  -- drop members who moved out of their group
  delete from chat_members m where m.room_id = v_sub
    and not exists (select 1 from profiles p join teams t on t.id = p.team and t.type = 'sub' where p.id = m.user_id);
  delete from chat_members m where m.room_id = v_perm
    and exists (select 1 from profiles p join teams t on t.id = p.team and t.type = 'sub' where p.id = m.user_id);
end; $$;

grant execute on function chat_sync_groups() to authenticated;
