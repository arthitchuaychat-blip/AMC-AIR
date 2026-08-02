---
name: team-chat-push
description: Team-chat Web Push notifications + PWA (app-icon badge) — how it works and the required setup
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

Team chat (`TeamChat.jsx`) has in-app unread badges (`countUnreadTeamChats` → sidebar badge in App.jsx) and **Web Push** for LINE-style notifications even when the app is closed.

Pieces: PWA manifest `app/public/manifest.webmanifest` + service worker `app/public/sw.js` (push + notificationclick; no caching). Client `app/src/lib/push.js` registers the SW, fetches the VAPID public key from `/api/push-key`, subscribes, and stores the subscription in `push_subscriptions` (migration `040_push_subscriptions.sql`). `app/api/push-send.js` (uses the `web-push` dep + service role) sends to all other room members; it's fired fire-and-forget from `sendChatMessage/Image/File` in api.js. App-icon badge via `navigator.setAppBadge(line+team unread)` (installed PWA only). "เปิดแจ้งเตือน" button in the Team Chat header grants permission + subscribes.

**Required server setup (user does this; no-ops gracefully until done):** 1) run migration 040. 2) generate keys with `npx web-push generate-vapid-keys`. 3) add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (e.g. `mailto:...`) to Vercel env. 4) redeploy. 5) each phone: Add to Home Screen → open → "เปิดแจ้งเตือน" → allow. iOS needs installed PWA + iOS 16.4+.

Limits: badge NUMBER on the icon is exact while the app has run (setAppBadge); a closed-app push currently shows the banner + a badge dot, not the precise count. See [[line-oa-chat]] for the customer-facing LINE chat (separate system).
