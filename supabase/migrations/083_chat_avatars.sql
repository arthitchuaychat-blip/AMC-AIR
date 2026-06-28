-- 083_chat_avatars.sql — รูปโปรไฟล์: ของแต่ละคน (profiles) + ของกลุ่ม/ห้องงาน (chat_rooms)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

alter table profiles   add column if not exists avatar_url text;
alter table chat_rooms add column if not exists avatar_url text;

-- ผู้ใช้เปลี่ยน "รูปของตัวเอง" ได้เท่านั้น — ใช้ SECURITY DEFINER เพื่อแก้เฉพาะ avatar_url
-- (ไม่เปิด policy update ทั้งแถวให้ผู้ใช้ทั่วไป จะได้ไม่มีช่องแก้ role ตัวเอง)
create or replace function set_my_avatar(p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update profiles set avatar_url = nullif(p_url, '') where id = auth.uid();
end; $$;

-- ทีมหลังบ้านเปลี่ยน "รูปกลุ่ม/ห้องงาน" ได้ (ไม่แตะห้องบริษัท/ส่วนตัว)
create or replace function set_room_avatar(p_room bigint, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  update chat_rooms set avatar_url = nullif(p_url, '')
   where id = p_room and kind in ('group','project');
end; $$;

grant execute on function set_my_avatar(text)           to authenticated;
grant execute on function set_room_avatar(bigint, text) to authenticated;
