-- แชตลูกค้า: "รอตอบ" — รู้ว่าห้องไหนลูกค้าพูดเป็นคนสุดท้ายและรอมานานเท่าไร (v854)
-- ปัญหาเดิม: เลขค้างอ่าน (unread) ถูกล้างเป็น 0 ทันทีที่ "มีคนเปิดห้อง" แม้ยังไม่ได้ตอบ → ห้องไหลลงไปปนกับห้องอื่น ไม่มีสัญญาณว่าลูกค้ารออยู่
--   (วัด 18 ก.ย. 2026: 7 วันล่าสุด 138 ห้อง · ข้อความสุดท้ายเป็นของลูกค้า 37 ห้อง · ทั้ง 37 ห้อง unread = 0)
-- ใหม่: trigger จำทิศทางข้อความล่าสุด + เวลาที่ลูกค้าเริ่มรอ (ข้อความขาเข้าแรกหลังเราตอบครั้งสุดท้าย)
--   waiting_since is not null = รอตอบ · เราตอบ (out — รวมบอท) → ล้าง · ปุ่ม "ไม่ต้องตอบ" ในแอป → ล้างเอง
-- รันซ้ำได้ · ยังไม่รัน = แอปซ่อนป้าย/ตัวกรองรอตอบ ใช้งานอื่นได้ปกติ

alter table line_contacts add column if not exists last_direction text;
alter table line_contacts add column if not exists waiting_since timestamptz;
alter table fb_contacts   add column if not exists last_direction text;
alter table fb_contacts   add column if not exists waiting_since timestamptz;
create index if not exists line_contacts_waiting_idx on line_contacts(waiting_since) where waiting_since is not null;
create index if not exists fb_contacts_waiting_idx   on fb_contacts(waiting_since)   where waiting_since is not null;

create or replace function trg_line_msg_waiting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'in' then
    -- ลูกค้าส่งหลายข้อความติดกัน: เวลาเริ่มรอ = ข้อความแรกของชุด ไม่ใช่ข้อความล่าสุด
    update line_contacts set last_direction = 'in', waiting_since = coalesce(waiting_since, new.created_at, now())
      where line_user_id = new.line_user_id and (last_direction is distinct from 'in' or waiting_since is null);
  else
    update line_contacts set last_direction = 'out', waiting_since = null
      where line_user_id = new.line_user_id and (last_direction is distinct from 'out' or waiting_since is not null);
  end if;
  return new;
end $$;
drop trigger if exists line_messages_waiting on line_messages;
create trigger line_messages_waiting after insert on line_messages for each row execute function trg_line_msg_waiting();

create or replace function trg_fb_msg_waiting() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'in' then
    update fb_contacts set last_direction = 'in', waiting_since = coalesce(waiting_since, new.created_at, now())
      where psid = new.psid and (last_direction is distinct from 'in' or waiting_since is null);
  else
    update fb_contacts set last_direction = 'out', waiting_since = null
      where psid = new.psid and (last_direction is distinct from 'out' or waiting_since is not null);
  end if;
  return new;
end $$;
drop trigger if exists fb_messages_waiting on fb_messages;
create trigger fb_messages_waiting after insert on fb_messages for each row execute function trg_fb_msg_waiting();

-- ⚠️ หมายเหตุ trigger: ถ้าลูกค้าส่งมาอีกหลังถูกกด "ไม่ต้องตอบ" (waiting_since = null, last_direction = 'in') → เงื่อนไข waiting_since is null ทำให้กลับมานับรอใหม่ ถูกต้อง

-- ย้อนหลัง: ตั้งทิศทางล่าสุดให้ทุกห้อง · นับ "รอตอบ" เฉพาะห้องที่ข้อความล่าสุดไม่เกิน 14 วัน (ไม่ปลุกแชตเก่าเป็นร้อยห้องขึ้นมาเป็นงานค้าง)
with lastmsg as (
  select distinct on (line_user_id) line_user_id, direction, created_at from line_messages order by line_user_id, created_at desc
), since as (
  select l.line_user_id,
    (select min(m.created_at) from line_messages m where m.line_user_id = l.line_user_id and m.direction = 'in'
       and m.created_at > coalesce((select max(o.created_at) from line_messages o where o.line_user_id = l.line_user_id and o.direction = 'out'), '-infinity'::timestamptz)) as ws
  from lastmsg l where l.direction = 'in' and l.created_at > now() - interval '14 days'
)
update line_contacts c set last_direction = l.direction, waiting_since = s.ws
from lastmsg l left join since s on s.line_user_id = l.line_user_id
where c.line_user_id = l.line_user_id;

with lastmsg as (
  select distinct on (psid) psid, direction, created_at from fb_messages order by psid, created_at desc
), since as (
  select l.psid,
    (select min(m.created_at) from fb_messages m where m.psid = l.psid and m.direction = 'in'
       and m.created_at > coalesce((select max(o.created_at) from fb_messages o where o.psid = l.psid and o.direction = 'out'), '-infinity'::timestamptz)) as ws
  from lastmsg l where l.direction = 'in' and l.created_at > now() - interval '14 days'
)
update fb_contacts c set last_direction = l.direction, waiting_since = s.ws
from lastmsg l left join since s on s.psid = l.psid
where c.psid = l.psid;
