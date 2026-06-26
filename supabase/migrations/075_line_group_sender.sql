-- store who sent a message inside a LINE group/room
alter table line_messages add column if not exists sender_id   text;
alter table line_messages add column if not exists sender_name text;
