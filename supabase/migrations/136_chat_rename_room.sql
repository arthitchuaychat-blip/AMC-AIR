-- 136_chat_rename_room.sql — ทีมหลังบ้านแก้ชื่อห้องกลุ่ม/ห้องงานในแชตทีมได้
-- (ห้องบริษัท/แชตส่วนตัวแก้ชื่อไม่ได้ — DM ใช้ชื่อคู่สนทนาอยู่แล้ว)
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create or replace function chat_rename_room(p_room bigint, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if my_role() not in ('admin','exec','finance','sales') then raise exception 'forbidden'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'ใส่ชื่อกลุ่ม'; end if;
  update chat_rooms set name = trim(p_name) where id = p_room and kind in ('group','project');
  if not found then raise exception 'แก้ชื่อได้เฉพาะห้องกลุ่ม/ห้องงาน'; end if;
end; $$;

grant execute on function chat_rename_room(bigint, text) to authenticated;

-- ✅ ตรวจผล: ต้องเห็นฟังก์ชัน 1 แถว
select proname from pg_proc where proname = 'chat_rename_room';
