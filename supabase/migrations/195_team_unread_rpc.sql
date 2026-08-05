-- 195_team_unread_rpc.sql — นับข้อความแชตทีมที่ยังไม่อ่าน "รวมทุกห้อง" ใน query เดียว
-- เดิม: countUnreadTeamChats → listChatRooms() ที่วน chat_messages 2 query/ห้อง (N+1) × poll ทุกคน = 2.1 ล้านครั้ง กิน CPU
-- ใหม่: ฟังก์ชันเดียว join chat_members(last_read_at) กับ chat_messages → count ครั้งเดียว
-- รันใน Supabase → SQL Editor (ครั้งเดียว)

create or replace function team_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from chat_messages m
  join chat_members mem
    on mem.room_id = m.room_id and mem.user_id = auth.uid()
  where m.sender <> auth.uid()
    and (mem.last_read_at is null or m.created_at > mem.last_read_at);
$$;

grant execute on function team_unread_count() to authenticated;

-- ✅ ตรวจผล
select 'team_unread_count() ready' as status;
