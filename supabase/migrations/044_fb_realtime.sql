-- 044_fb_realtime.sql — stream FB chat changes to the app live (like the LINE tables).
alter publication supabase_realtime add table fb_contacts;
alter publication supabase_realtime add table fb_messages;
