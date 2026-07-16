---
name: gcal-feed
description: "Job schedule → Google Calendar via a token-gated ICS feed (subscribe, read-only)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 85b6d010-27bd-419a-ad75-1ac380626a9a
---

Google Calendar sync for the job schedule (added 2026-06-19, v82). Chose **option B: subscribe to an ICS feed** (read-only, auto-refresh) over per-event links or full OAuth 2-way. See [[vatsadu-os-app]] / [[production-plan]].

- **Endpoint** `app/api/calendar.js` (Vercel serverless, Node). Outputs `text/calendar`. Gated by a secret token in the URL because calendar feeds can't send auth headers: `/api/calendar?token=<CALENDAR_FEED_TOKEN>` (all teams) or `&team=<teamId>` (one team). Fetches job_orders + job_visits + customers + teams via Supabase REST (service-role key, same pattern as fb-send.js). One VEVENT per visit (uses job_visits rounds, falls back to job-level scheduled_at); skips cancelled. Times output in UTC `Z`; durations by slot (morning/afternoon 3h, full 7h → 10:00–17:00, custom 2h); multi-day uses end_date 17:00 +07:00. RFC5545 line folding at 74 octets. `Cache-Control max-age=900`.
- **Env to add in Vercel:** `CALENDAR_FEED_TOKEN` (user sets a long secret, then Redeploy). Without it the endpoint returns 503.
- **UI:** Schedule page → "Google ปฏิทิน" button (office/canEdit only) → `GoogleCalModal` in `Schedule.jsx`. User pastes the same token (stored in localStorage `amc_cal_token`), the modal builds the subscribe URL (all-teams + current-team + per-team list) with copy buttons. Instructions: Google Calendar → Other calendars → ＋ → From URL → paste.
- Read-only: edits in Google don't sync back. If 2-way is ever needed → Google Calendar API + OAuth (option C, not built).
