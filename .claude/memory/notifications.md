---
name: notifications
description: "app-wide notification system — in-app bell + web push, per-role on/off; mig 058"
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

App-wide notifications (v142, 2026-06-22 — needs migration `058_notifications.sql`). Builds on the existing team-chat Web Push ([[team-chat-push]]).

- **Table** `notifications` (user_id recipient, category, title, body, url=module-id, ref_type/ref_no, actor, read_at). RLS: read/update/delete own, insert by any authenticated (actors notify others).
- **Categories** (NOTIFY_CATS in api.js): team_chat · task · job · hr · customer_chat.
- **`notify(recipientIds, {category,title,body,url,ref_type,ref_no,push})`** in api.js — dedupes, drops the actor, filters each recipient by per-role on/off, inserts rows, and fires push via `/api/push-send` (now accepts `userIds`, not just `roomId`). Never throws (wrapped). Helpers `_usersByRole`, `_jobWatchers` (office admin/exec/sales + assigned team), `_notifySettings` (cached).
- **Triggers wired** (client-side, in the actor's api call): saveTask/setTaskStatus/addTaskComment; saveJobOrder(handoff)/updateJobStatus/updateVisitStatus/setJobVisitsStatus/addJobLog; checkIn/submitLeave/decideLeave/submitAdvance/decideAdvance; sendChatMessage/Image/File (in-app only, push handled by _firePush). Customer chat is **server-side** in `api/line-webhook.js` (notifyCustomerChat → sales/admin/exec, bell + web push). FB webhook NOT yet wired (follow-up).
- **UI**: `NotificationBell.jsx` in App.jsx header (mobile topbar + desktop sidebar brand) — unread badge, 30s poll, dropdown, click marks read + `onOpen(url)`→`go(moduleId)`. Push `url` is always "/" (SPA has no routes); precise nav only via the bell.
- **Per-role on/off**: Settings → `NotifyCard` (role × category matrix) → app_config key `notify_settings` (`{role:{cat:false}}`, default on). get/saveNotifySettings.
