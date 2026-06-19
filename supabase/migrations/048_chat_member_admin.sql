-- 048_chat_member_admin.sql — back-office can manage any group's membership; drop the auto "ช่างซัพ" group.

-- remove the auto subcontractor umbrella group (no longer wanted)
delete from chat_rooms where ref_type = 'autogroup' and ref_no = 'sub';

-- chat_sync_groups now maintains ONLY the "พนักงานประจำ" group, and is insert-only
-- (never removes), so manual add/remove by the office is never clobbered.
create or replace function chat_sync_groups() returns void
language plpgsql security definer set search_path = public as $$
declare v_perm bigint;
begin
  if my_role() not in ('admin','exec') then raise exception 'forbidden'; end if;
  select id into v_perm from chat_rooms where ref_type = 'autogroup' and ref_no = 'permanent' limit 1;
  if v_perm is null then
    insert into chat_rooms(kind, name, ref_type, ref_no, created_by)
      values ('group', 'พนักงานประจำ', 'autogroup', 'permanent', auth.uid()) returning id into v_perm;
  end if;
  insert into chat_members(room_id, user_id)
    select v_perm, p.id from profiles p
    where not exists (select 1 from teams t where t.id = p.team and t.type = 'sub')
      and not exists (select 1 from chat_members m where m.room_id = v_perm and m.user_id = p.id);
end; $$;

-- office (ทีมหลังบ้าน) may add/remove ANY member of ANY group/project room
create or replace function chat_admin_add_member(p_room bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  insert into chat_members(room_id, user_id) values (p_room, p_user) on conflict do nothing;
end; $$;

create or replace function chat_admin_remove_member(p_room bigint, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  delete from chat_members where room_id = p_room and user_id = p_user;
end; $$;

-- read a room's member ids (office, or members of that room) — for the manage-members UI
create or replace function chat_room_members(p_room bigint) returns setof uuid
language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('admin','exec','finance','sales') and not chat_is_member(p_room) then raise exception 'forbidden'; end if;
  return query select user_id from chat_members where room_id = p_room;
end; $$;

grant execute on function chat_admin_add_member(bigint, uuid) to authenticated;
grant execute on function chat_admin_remove_member(bigint, uuid) to authenticated;
grant execute on function chat_room_members(bigint) to authenticated;

-- let the office SEE every group/project room (so they can pick any group to manage); DMs stay private
drop policy if exists cr_read on chat_rooms;
create policy cr_read on chat_rooms for select to authenticated using (
  kind = 'company' or chat_is_member(id)
  or (kind in ('group','project') and my_role() in ('admin','exec','finance','sales'))
);
