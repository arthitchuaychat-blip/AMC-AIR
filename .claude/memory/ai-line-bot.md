---
name: ai-line-bot
description: "บอท AI ตอบไลน์ลูกค้านอกเวลาทำการ (Claude Sonnet 5) ใน line-webhook.js — เปิดใน ตั้งค่า→ตอบอัตโนมัติ, ต้องมี ANTHROPIC_API_KEY บน Vercel"
metadata: 
  node_type: memory
  type: project
  originSessionId: b8d73488-693d-46d1-b5f3-7849cf1f6166
---

After-hours LINE AI bot (v401, 2026-07-15). Lives in `app/api/line-webhook.js` → `aiAnswer(convId, question, cfg)`, hooked into `autoReply()` **before** the static welcome/after-hours branches. See [[line-oa-chat]].

- **Trigger**: autoreply enabled + `cfg.ai_enabled` + after-hours (`!isOpenNow`) + 1:1 user chat + text message + `ANTHROPIC_API_KEY` set. Suppliers (`line_contacts.kind === "supplier"`) excluded. No cooldown (conversational); any failure falls through to the old static after-hours text.
- **Model**: `claude-sonnet-5`, raw fetch to `api.anthropic.com/v1/messages` (repo convention: no SDK in api/ functions), `max_tokens: 1600` (adaptive thinking counts in budget), `output_config: {effort: "medium"}` — **effort low misread the BTU price-tier table** (quoted the adjacent tier), catalog system block has `cache_control: ephemeral`. NO sampling params (400 on Sonnet 5).
- **Data (v407)**: full `materials` table, **TWO separate queries** — kind=ac (855 rows, limit 1000) and kind=service (69 rows, limit 200). One combined query loses all services: ACs fill the row window ([[supabase-1000-row-cap]] lesson). `kind=material` deliberately EXCLUDED (owner: internal only). Full product-card detail: name_en (only when not contained in name_th), pipe_size, refrigerant, voltage, power_cost_year (ค่าไฟ~x บาท/ปี — bot compares efficiency across models), description (clip 200/250), features (clip 300, empty as of 2026-07 but wired). Safe fields only — `sale_price`, never cost/stock/supplier. sale_price 0 renders "สอบถามราคา" + rule forbids estimating. Anthropic tfetch timeout 40s (big prompt ≈60-70k tokens; answers ~9-18s). Last 10 text messages as history (current message already stored → included). Config extras via `cfg.ai_extra`.
- **Persona rules**: male speech, "ครับ" only — ห้าม ค่ะ/คะ (it slipped one in); careful BTU-tier matching rule; never invent prices/promos; never confirm bookings.
- **Reply**: prefixed `🤖 `, sent via reply-token→push fallback (`sendAuto`), recorded on the chat board as outbound (`recordAutoReply`).
- **Config**: stored in `app_config.autoreply` (`ai_enabled`, `ai_extra` merged into existing keys). UI = Settings → ตอบอัตโนมัติ (AutoReplyCard) purple box, shows live key status from `/api/line-webhook?check=1` (which now reports `ANTHROPIC_API_KEY` presence).
- **Vercel**: `app/vercel.json` sets `functions.api/line-webhook.js.maxDuration: 60` so the LLM call doesn't hit the 10s default. User creates the key at platform.claude.com and sets env `ANTHROPIC_API_KEY` themselves (never handle the secret).
- **v405 fix — no replyToken (2026-07-16)**: real inbound message events on this OA arrive **without `ev.replyToken`** (`tok:false` even with `redeliv:false` — not a redelivery artifact). autoReply must NOT require a token: guard only on `isUser`; `sendAuto` falls back to `linePush`. Redelivered events (`ev.deliveryContext.isRedelivery`) are skipped to avoid double answers. Verified live: `ok:true, ms:10580, tok:false`.
- **Debugging**: black box `app_config.ai_bot_last` records every inbound-text decision `{at, conv, q, ok/skip, ms, err, tok, redeliv}` — read via `?autoreply=1` (`ai_last`). `?aitest=1&q=...&find=<display_name>` replays a real conversation through aiAnswer. **Vercel freezes un-awaited promises after the response — every fire-and-forget write must be awaited.**
