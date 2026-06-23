-- 062_unsend.sql — allow unsending a message within a short window (soft-delete → tombstone).

-- team chat: sender can soft-delete their own message
alter table chat_messages add column if not exists deleted boolean default false;
drop policy if exists msg_update on chat_messages;
create policy msg_update on chat_messages for update to authenticated
  using (sender = auth.uid()) with check (sender = auth.uid());

-- customer LINE chat: office can soft-delete an outbound message (it can't be recalled from the
-- customer's device — LINE has no recall API — this only removes it from our chat board)
alter table line_messages add column if not exists deleted boolean default false;
drop policy if exists lm_update on line_messages;
create policy lm_update on line_messages for update to authenticated
  using (my_role() in ('admin','sales','exec','finance')) with check (my_role() in ('admin','sales','exec','finance'));

-- Facebook chat (fb_messages already has a for-all write policy for office roles)
alter table fb_messages add column if not exists deleted boolean default false;
