-- 135_chat_delete_room.sql — ธุรการ/ผู้บริหาร ลบห้องกลุ่ม/ห้องงานในแชตทีมได้
-- ลบถาวรทั้งข้อความ+สมาชิก+ห้อง · ห้องบริษัทและแชตส่วนตัว (DM) ลบไม่ได้
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create or replace function chat_delete_room(p_room bigint) returns void
language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if my_role() not in ('admin','exec') then raise exception 'forbidden'; end if;
  select kind into v_kind from chat_rooms where id = p_room;
  if v_kind is null then raise exception 'ไม่พบห้อง'; end if;
  if v_kind not in ('group','project') then raise exception 'ลบได้เฉพาะห้องกลุ่ม/ห้องงาน'; end if;
  delete from chat_messages where room_id = p_room;
  delete from chat_members  where room_id = p_room;
  delete from chat_rooms    where id = p_room;
end; $$;

grant execute on function chat_delete_room(bigint) to authenticated;

-- ✅ ตรวจผล: ต้องเห็นฟังก์ชัน 1 แถว
select proname from pg_proc where proname = 'chat_delete_room';
