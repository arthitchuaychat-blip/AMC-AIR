// LINE Messaging API webhook (Node.js runtime — ต่อ api.line.me ได้เสถียรกว่า Edge + ใช้ supabase REST)
// Vercel env vars: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Webhook URL: https://<โดเมนแอป>/api/line-webhook
// ดีบัก: ?check=1 · ?dbcheck=1 · ?selftest=1 · ?linetest=1 (เช็กว่าต่อ api.line.me ได้ไหม)
import crypto from "crypto";
import webpush from "web-push";

export const config = { api: { bodyParser: false } }; // ต้องการ raw body เพื่อเช็กลายเซ็น

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = () => process.env.LINE_CHANNEL_SECRET || "";
const TOKEN = () => process.env.LINE_CHANNEL_ACCESS_TOKEN || "";
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

async function tfetch(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function lineGet(path) {
  try {
    const r = await tfetch(`https://api.line.me/v2/bot/${path}`, { headers: { Authorization: `Bearer ${TOKEN()}` } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// the conversation id for a LINE event source: a group/room is its own chat (not the individual sender),
// so group/multi-person messages land in ONE thread instead of being scattered per sender.
const convOf = (src) => (src && (src.groupId || src.roomId || src.userId)) || null;

// resolve a display name (+ picture) for a conversation source.
// group → group name (1-on-1 profile API doesn't work for group members, which is why groups showed "LINE User")
async function resolveName(src) {
  if (src.type === "group") {
    const s = await lineGet(`group/${src.groupId}/summary`);
    return { name: s?.groupName ? `👥 ${s.groupName}` : null, pic: s?.pictureUrl || null, fallback: "👥 กลุ่ม LINE" };
  }
  if (src.type === "room") {
    return { name: null, pic: null, fallback: "👥 แชตกลุ่ม" };
  }
  const p = src.userId ? await lineGet(`profile/${src.userId}`) : null;
  return { name: p?.displayName || null, pic: p?.pictureUrl || null, fallback: "LINE User" };
}

const isPlaceholder = (n) => !n || n === "LINE User" || n === "👥 กลุ่ม LINE" || n === "👥 แชตกลุ่ม";

// create the contact if new; if it already exists but still has a placeholder name, refresh it
// returns true if this contact was newly created (i.e. their first-ever message)
async function ensureContact(convId, src) {
  const r = await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(convId)}&select=display_name`, { headers: sbH() });
  const arr = r.ok ? await r.json() : [];
  const exists = Array.isArray(arr) && arr.length;
  if (exists && !isPlaceholder(arr[0].display_name)) return false; // already has a real name → no LINE API call needed
  const { name, pic, fallback } = await resolveName(src);
  if (exists) {
    if (name) {
      const patch = { display_name: name };
      if (pic) patch.picture_url = pic;
      await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(convId)}`, {
        method: "PATCH", headers: sbH(), body: JSON.stringify(patch),
      });
    }
    return false;
  }
  await tfetch(`${SB()}/rest/v1/line_contacts`, {
    method: "POST", headers: { ...sbH(), Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ line_user_id: convId, display_name: name || fallback, picture_url: pic }),
  });
  return true;
}

// ---------- auto-reply (welcome / after-hours) — rule-based, no AI ----------
async function getAutoReplyCfg() {
  try {
    const r = await tfetch(`${SB()}/rest/v1/app_config?key=eq.autoreply&select=value`, { headers: sbH() });
    return (r.ok ? (await r.json())[0]?.value : null) || null;
  } catch { return null; }
}
// reply via the event's replyToken (free, doesn't use push quota). returns {ok, status, body}.
async function lineReply(replyToken, text) {
  try {
    const r = await tfetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
    });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body };
  } catch (e) { return { ok: false, status: 0, body: String(e?.message || e) }; }
}
// push fallback (used when the free reply fails, e.g. token expired)
async function linePush(to, text) {
  try {
    const r = await tfetch("https://api.line.me/v2/bot/message/push", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
      body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
    });
    const body = await r.text();
    return { ok: r.ok, status: r.status, body };
  } catch (e) { return { ok: false, status: 0, body: String(e?.message || e) }; }
}
// send a reply (try free reply token, fall back to push) — only record/stamp cooldown if it actually sent
async function sendAuto(replyToken, convId, text) {
  const replyRes = await lineReply(replyToken, text);
  if (replyRes.ok) { await recordAutoReply(convId, text); return true; }
  const pushRes = await linePush(convId, text);
  if (pushRes.ok) { await recordAutoReply(convId, text); return true; }
  // log failure so ?arsend probe can surface it
  console.error("autoReply failed — reply:", replyRes.status, replyRes.body, "| push:", pushRes.status, pushRes.body);
  return false;
}
// is "now" within business hours? (computed in Thai time, UTC+7)
function isOpenNow(cfg) {
  const th = new Date(Date.now() + 7 * 3600 * 1000);
  const day = th.getUTCDay(); // 0=Sun … 6=Sat
  const mins = th.getUTCHours() * 60 + th.getUTCMinutes();
  const days = Array.isArray(cfg.open_days) && cfg.open_days.length ? cfg.open_days : [1, 2, 3, 4, 5, 6];
  if (!days.includes(day)) return false;
  const toMin = (s) => { const p = String(s || "").split(":"); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); };
  return mins >= toMin(cfg.open_time || "08:00") && mins < toMin(cfg.close_time || "18:00");
}
// ---------- AI bot (นอกเวลาทำการ): ตอบคำถามสินค้า/ราคา/บริการจากแคตตาล็อกจริง ----------
// ใช้ Claude Sonnet 5 · ข้อมูล = web_products (ชุดเดียวกับหน้าเว็บ amcair.net — ราคาขายสาธารณะ ไม่มีต้นทุนภายใน)
// เงื่อนไข: เปิดใน ตั้งค่า→ตอบอัตโนมัติ + ตั้ง ANTHROPIC_API_KEY บน Vercel · ตอบเฉพาะแชต 1:1 ที่ไม่ใช่ซัพพลายเออร์
async function aiAnswer(convId, question, cfg, afterHours = true) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    // ไม่ตอบซัพพลายเออร์ด้วยแคตตาล็อกลูกค้า
    const kr = await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(convId)}&select=kind`, { headers: sbH() });
    if (kr.ok && ((await kr.json())[0]?.kind === "supplier")) return null;

    // แคตตาล็อกสาธารณะ (แอร์ + บริการ) — ย่อเป็นบรรทัดละรายการ ประหยัดโทเคน
    const pr = await tfetch(`${SB()}/rest/v1/web_products?select=kind,brand,name_th,ac_type,btu,sale_price,seer&order=kind.asc,brand.asc,btu.asc&limit=500`, { headers: sbH() });
    const prods = pr.ok ? await pr.json() : [];
    if (!prods.length) return null;
    const line = (p) => [p.brand, p.name_th, p.ac_type, p.btu ? `${p.btu} BTU` : null, p.seer ? `SEER ${p.seer}` : null,
      p.sale_price != null ? `${Number(p.sale_price).toLocaleString("en-US")} บาท` : "สอบถามราคา"].filter(Boolean).join(" | ");
    const catalog = prods.map(line).join("\n");

    // ประวัติแชตล่าสุด → บอทตอบต่อเนื่องได้ (ข้อความปัจจุบันถูกบันทึกไปแล้ว จึงอยู่ในนี้ด้วย)
    const hr = await tfetch(`${SB()}/rest/v1/line_messages?line_user_id=eq.${encodeURIComponent(convId)}&type=eq.text&select=direction,text&order=created_at.desc&limit=10`, { headers: sbH() });
    let hist = hr.ok ? (await hr.json()).reverse() : [];
    let messages = hist.filter((m) => (m.text || "").trim())
      .map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: m.text }));
    while (messages.length && messages[0].role !== "user") messages.shift();   // ต้องเริ่มด้วย user
    if (!messages.length) messages = [{ role: "user", content: question }];

    const days = (Array.isArray(cfg.open_days) && cfg.open_days.length ? cfg.open_days : [1, 2, 3, 4, 5, 6])
      .map((d) => ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"][d]).join(", ");
    const rules = `คุณคือผู้ช่วย AI ของ AMC AIR ร้านขาย-ติดตั้ง-ล้าง-ซ่อมแอร์ ${afterHours ? "ตอนนี้อยู่นอกเวลาทำการ คุณตอบลูกค้าทางไลน์แทนทีมงาน" : "คุณช่วยตอบลูกค้าทางไลน์เบื้องต้น ระหว่างที่ทีมงานอาจยังไม่ว่างตอบทันที"}

กติกาสำคัญ (ต้องทำตามเคร่งครัด):
- ตอบจาก "รายการสินค้าและบริการ" ที่ให้ไว้เท่านั้น ห้ามเดาหรือแต่งราคา รุ่น ส่วนลด หรือโปรโมชั่นที่ไม่มีในข้อมูลเด็ดขาด
- ถ้าข้อมูลไม่พอ บอกตรง ๆ ว่า${afterHours ? `ทีมงานจะตอบในเวลาทำการ (${days} ${cfg.open_time || "08:00"}–${cfg.close_time || "18:00"} น.)` : "ทีมงานจะติดต่อกลับโดยเร็ว"} และชวนลูกค้าฝากชื่อ เบอร์โทร และรายละเอียดหน้างานไว้
- ห้ามยืนยันนัดหมายหรือการจอง — รับเรื่องไว้ได้ แต่บอกว่าทีมงานจะโทรยืนยันอีกครั้ง
- แนะนำขนาดแอร์ได้: 9,000 BTU ≈ ห้อง 12–15 ตร.ม. · 12,000 ≈ 16–20 · 18,000 ≈ 24–30 · 24,000 ≈ 32–40 แล้วเลือกรุ่นที่ตรงจากรายการ
- ตอบภาษาไทย สุภาพ ลงท้าย "ครับ" เสมอ กระชับ ไม่เกิน 6 บรรทัด ใช้อีโมจิพอประมาณ
- เว็บไซต์ www.amcair.net · โทร 099-262-9090 (แจ้งเมื่อเกี่ยวข้อง)${(cfg.ai_extra || "").trim() ? "\n\nข้อมูลเพิ่มเติมจากร้าน:\n" + cfg.ai_extra.trim() : ""}`;

    const r = await tfetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1200,                   // Sonnet 5 คิด (adaptive thinking) รวมในงบนี้ด้วย — เผื่อไว้ไม่ให้คำตอบขาด
        output_config: { effort: "low" },   // ตอบไว เหมาะกับแชต
        system: [
          { type: "text", text: rules },
          { type: "text", text: "รายการสินค้าและบริการ (ราคาหน้าร้านจริง):\n" + catalog, cache_control: { type: "ephemeral" } },
        ],
        messages,
      }),
    }, 25000);
    if (!r.ok) { console.error("ai-bot api error:", r.status, (await r.text()).slice(0, 300)); return null; }
    const data = await r.json();
    if (data.stop_reason === "refusal") return null;
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    return text || null;
  } catch (e) { console.error("ai-bot error:", e?.message || String(e)); return null; }
}

// store the auto-reply as an outbound message + stamp last_autoreply_at (for cooldown)
async function recordAutoReply(convId, text) {
  await tfetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ line_user_id: convId, direction: "out", type: "text", text, sent_by: null }) });
  await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(convId)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ last_autoreply_at: new Date().toISOString() }) });
}
async function autoReply(replyToken, convId, isNew, isUser, msgRow) {
  try {
    if (!replyToken || !isUser) return;        // only 1-on-1 user chats
    const cfg = await getAutoReplyCfg();
    if (!cfg || !cfg.enabled) return;
    const afterHours = !isOpenNow(cfg);
    // 0) บอท AI: ตอบคำถามจริงจากแคตตาล็อกทุกข้อความ (ไม่มี cooldown — คุยต่อเนื่องได้)
    //    ปกติตอบเฉพาะนอกเวลาทำการ · ติ๊ก "ตอบทุกเวลา" (ai_always) = ตอบตลอดรวมเวลาทำการ (โหมดทดสอบ/ช่วยทีม)
    //    ตอบเฉพาะข้อความตัวอักษร · ถ้า AI ล้มเหลว/ปิด/ไม่มี key จะไหลลงข้อความตายตัวเดิมตามปกติ
    if (cfg.ai_enabled && (afterHours || cfg.ai_always) && msgRow?.type === "text" && (msgRow.text || "").trim()) {
      const answer = await aiAnswer(convId, msgRow.text.trim(), cfg, afterHours);
      if (answer) { await sendAuto(replyToken, convId, "🤖 " + answer); return; }
    }
    // 1) welcome a brand-new contact (their first message)
    if (isNew && cfg.welcome_enabled && (cfg.welcome_text || "").trim()) {
      await sendAuto(replyToken, convId, cfg.welcome_text);
      return;                                   // don't also send after-hours on the first message
    }
    // 2) after-hours auto-reply (with cooldown so we don't reply to every message)
    if (cfg.afterhours_enabled && (cfg.afterhours_text || "").trim() && afterHours) {
      const cd = Number(cfg.cooldown_min) || 120;
      const r = await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(convId)}&select=last_autoreply_at`, { headers: sbH() });
      const last = r.ok ? (await r.json())[0]?.last_autoreply_at : null;
      if (last && (Date.now() - new Date(last).getTime()) < cd * 60000) return; // too soon since last auto-reply
      await sendAuto(replyToken, convId, cfg.afterhours_text);
    }
  } catch (_) { /* never break the webhook */ }
}

// download a LINE message's binary content and store it in the photos bucket; returns the public URL
async function saveContent(messageId, ext, fallbackType) {
  try {
    const r = await tfetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, { headers: { Authorization: `Bearer ${TOKEN()}` } }, 15000);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const ct = r.headers.get("content-type") || fallbackType || "application/octet-stream";
    const up = await tfetch(`${SB()}/storage/v1/object/photos/line/${messageId}.${ext}`, {
      method: "POST",
      headers: { apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": ct, "x-upsert": "true" },
      body: buf,
    }, 15000);
    return up.ok ? `${SB()}/storage/v1/object/public/photos/line/${messageId}.${ext}` : null;
  } catch { return null; }
}
const saveImage = (messageId) => saveContent(messageId, "jpg", "image/jpeg");

async function readRaw(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

// notify back-office (sales/admin/exec) about an inbound customer message — bell + web push.
// respects the per-role on/off matrix (app_config.notify_settings.customer_chat). Best-effort.
async function notifyCustomerChat(title, body, convId) {
  try {
    const cfgR = await tfetch(`${SB()}/rest/v1/app_config?key=eq.notify_settings&select=value`, { headers: sbH() });
    const cfg = (cfgR.ok ? ((await cfgR.json())[0]?.value) : null) || {};
    const pr = await tfetch(`${SB()}/rest/v1/profiles?role=in.("sales","admin","exec")&select=id,role`, { headers: sbH() });
    const profs = pr.ok ? await pr.json() : [];
    const ids = profs.filter((p) => { const s = cfg[p.role]; return !s || s.customer_chat !== false; }).map((p) => p.id);
    if (!ids.length) return;
    await tfetch(`${SB()}/rest/v1/notifications`, { method: "POST", headers: sbH(), body: JSON.stringify(ids.map((id) => ({ user_id: id, category: "customer_chat", title, body: (body || "").slice(0, 180), url: "chat", ref_type: "line", ref_no: convId || null }))) });
    const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return;
    const inList = ids.map((id) => `"${id}"`).join(",");
    const sr = await tfetch(`${SB()}/rest/v1/push_subscriptions?user_id=in.(${inList})&select=endpoint,p256dh,auth`, { headers: sbH() });
    const subs = sr.ok ? await sr.json() : [];
    if (!subs.length) return;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@amcair.net", pub, priv);
    // กดแจ้งเตือนแล้วเปิดกระดานแชตโฟกัสลูกค้าคนนั้นเลย (hash deep-link: /#chat/<convId>) — เหมือน LINE กดแล้วเข้าห้อง
    const payload = JSON.stringify({ title, body: (body || "").slice(0, 180), url: convId ? "/#chat/" + encodeURIComponent(convId) : "/#chat", tag: "notif" });
    await Promise.all(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 1800 }).catch(() => {})));
  } catch (_) { /* ignore */ }
}

export default async function handler(req, res) {
  const params = new URLSearchParams((req.url.split("?")[1] || ""));

  if (req.method !== "POST") {
    if (params.get("check") === "1") {
      return res.status(200).json({
        LINE_CHANNEL_SECRET: !!process.env.LINE_CHANNEL_SECRET,
        LINE_CHANNEL_ACCESS_TOKEN: !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,   // บอท AI นอกเวลาทำการ
      });
    }
    // ?arsend=<lineUserId> — actually tries to push the after-hours text to that user and shows LINE's response
    if (params.get("arsend")) {
      const uid = params.get("arsend");
      const cfg = await getAutoReplyCfg();
      const text = (cfg?.afterhours_text || "").trim() || "(ไม่มีข้อความนอกเวลา)";
      const pushRes = await linePush(uid, text);
      const r2 = await tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(uid)}&select=last_autoreply_at`, { headers: sbH() });
      const contact = r2.ok ? (await r2.json())[0] : null;
      return res.status(200).json({ uid, pushOk: pushRes.ok, pushStatus: pushRes.status, pushBody: pushRes.body, textLen: text.length, tokenSet: !!TOKEN(), last_autoreply_at: contact?.last_autoreply_at });
    }
    if (params.get("autoreply") === "1") {
      const cfg = await getAutoReplyCfg();
      const th = new Date(Date.now() + 7 * 3600 * 1000);
      return res.status(200).json({
        hasConfig: !!cfg,
        enabled: cfg ? !!cfg.enabled : null,
        welcome_enabled: cfg ? !!cfg.welcome_enabled : null,
        afterhours_enabled: cfg ? !!cfg.afterhours_enabled : null,
        afterhours_text_len: (cfg?.afterhours_text || "").length,
        open_days: cfg?.open_days ?? null,
        open_time: cfg?.open_time ?? null,
        close_time: cfg?.close_time ?? null,
        cooldown_min: cfg?.cooldown_min ?? null,
        thai_time: th.toISOString().slice(11, 16),
        thai_day: th.getUTCDay(),
        isOpenNow: cfg ? isOpenNow(cfg) : null,
        wouldSendAfterHours: cfg ? (!!cfg.enabled && !!cfg.afterhours_enabled && (cfg.afterhours_text || "").trim().length > 0 && !isOpenNow(cfg)) : null,
        // สถานะบอท AI: จะตอบจริงต้อง enabled + ai_enabled + มี key + (นอกเวลาทำการ หรือติ๊กตอบทุกเวลา)
        ai_enabled: cfg ? !!cfg.ai_enabled : null,
        ai_always: cfg ? !!cfg.ai_always : null,
        anthropic_key: !!process.env.ANTHROPIC_API_KEY,
        aiWouldReplyNow: cfg ? (!!cfg.enabled && !!cfg.ai_enabled && !!process.env.ANTHROPIC_API_KEY && (!isOpenNow(cfg) || !!cfg.ai_always)) : null,
      });
    }
    if (params.get("dbcheck") === "1") {
      const out = {};
      for (const t of ["line_contacts", "line_messages"]) {
        try { const r = await tfetch(`${SB()}/rest/v1/${t}?select=*&limit=1`, { headers: sbH() }); out[t] = { status: r.status, body: (await r.text()).slice(0, 180) }; }
        catch (e) { out[t] = { error: e?.message || String(e) }; }
      }
      return res.status(200).json(out);
    }
    // ?aitest=1&q=<คำถาม> — ยิงบอท AI ตรง ๆ (ไม่ส่งเข้าไลน์) เพื่อดูคำตอบ/สาเหตุที่พังจริงจากเซิร์ฟเวอร์
    if (params.get("aitest") === "1") {
      const q = params.get("q") || "แอร์ 12000 BTU ราคาเท่าไหร่";
      const cfg = (await getAutoReplyCfg()) || {};
      const t0 = Date.now();
      const answer = await aiAnswer("__aitest__", q, cfg, !isOpenNow(cfg));
      return res.status(200).json({ ok: !!answer, ms: Date.now() - t0, question: q, answer: answer || null, hint: answer ? null : "ดู error จริงใน Vercel → Deployments → Functions log (ai-bot ...)" });
    }
    if (params.get("linetest") === "1") {
      const t0 = Date.now();
      try { const r = await tfetch(`https://api.line.me/v2/bot/profile/Udummy`, { headers: { Authorization: `Bearer ${TOKEN()}` } }); return res.status(200).json({ reached: true, status: r.status, ms: Date.now() - t0, body: (await r.text()).slice(0, 160) }); }
      catch (e) { return res.status(200).json({ reached: false, ms: Date.now() - t0, error: e?.message || String(e) }); }
    }
    if (params.get("selftest") === "1") {
      const uid = "Uselftest_delete_me"; const steps = [];
      const rec = async (name, p) => { const t0 = Date.now(); try { const r = await p; steps.push({ name, status: r.status, ms: Date.now() - t0 }); } catch (e) { steps.push({ name, error: e?.message || String(e), ms: Date.now() - t0 }); } };
      await rec("insert_contact", tfetch(`${SB()}/rest/v1/line_contacts`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ line_user_id: uid, display_name: "SELFTEST" }) }));
      await rec("insert_message", tfetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ line_user_id: uid, direction: "in", type: "text", text: "selftest" }) }));
      await rec("delete_contact", tfetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${uid}`, { method: "DELETE", headers: sbH() }));
      return res.status(200).json({ steps });
    }
    return res.status(200).send("ok");
  }

  const raw = await readRaw(req);
  const sig = crypto.createHmac("sha256", SECRET()).update(raw).digest("base64");
  if (sig !== req.headers["x-line-signature"]) return res.status(401).send("bad signature");

  let body; try { body = JSON.parse(raw.toString("utf8")); } catch { return res.status(200).send("ok"); }
  try {
    for (const ev of body.events || []) {
      const src = ev.source || {};
      const convId = convOf(src);
      if (!convId) continue;
      const isNewContact = await ensureContact(convId, src);
      if (ev.type === "message") {
        const m = ev.message;
        const row = { line_user_id: convId, direction: "in", type: m.type, line_message_id: m.id };
        if (m.quotedMessageId) row.quoted_message_id = m.quotedMessageId; // customer replied to a specific message
        if (m.quoteToken) row.quote_token = m.quoteToken;                 // lets us quote-reply this message later
        if (m.type === "text") row.text = m.text;
        else if (m.type === "image") { row.image_url = await saveImage(m.id); row.text = "[รูปภาพ]"; }
        else if (m.type === "sticker") { row.image_url = m.stickerId ? `https://stickershop.line-scdn.net/stickershop/v1/sticker/${m.stickerId}/android/sticker.png` : null; row.text = "[สติกเกอร์]"; }
        else if (m.type === "file") { const ext = ((m.fileName || "").split(".").pop() || "bin").toLowerCase(); row.file_url = await saveContent(m.id, ext); row.file_name = m.fileName || "ไฟล์"; row.text = `[ไฟล์] ${row.file_name}`; }
        else if (m.type === "video") { row.file_url = await saveContent(m.id, "mp4", "video/mp4"); row.file_name = "วิดีโอ.mp4"; row.text = "[วิดีโอ]"; }
        else if (m.type === "audio") { row.file_url = await saveContent(m.id, "m4a", "audio/m4a"); row.file_name = "เสียง.m4a"; row.text = "[เสียง]"; }
        else if (m.type === "location") { const q = (m.latitude != null && m.longitude != null) ? `${m.latitude},${m.longitude}` : encodeURIComponent(m.address || ""); row.file_url = `https://www.google.com/maps/search/?api=1&query=${q}`; row.text = `📍 ${m.title || m.address || "ตำแหน่งที่ตั้ง"}`; }
        else { row.text = `[${m.type}]`; }
        // for group/room messages, capture the individual sender's display name
        if (src.type === "group" && src.userId) {
          const member = await lineGet(`group/${src.groupId}/member/${src.userId}`);
          if (member?.displayName) { row.sender_id = src.userId; row.sender_name = member.displayName; }
        } else if (src.type === "room" && src.userId) {
          const member = await lineGet(`room/${src.roomId}/member/${src.userId}`);
          if (member?.displayName) { row.sender_id = src.userId; row.sender_name = member.displayName; }
        }
        await tfetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbH(), body: JSON.stringify(row) });
        await tfetch(`${SB()}/rest/v1/rpc/line_bump_unread`, { method: "POST", headers: sbH(), body: JSON.stringify({ p_uid: convId, p_msg: row.text || "[ข้อความ]" }) });
        await notifyCustomerChat("💬 ข้อความใหม่จากลูกค้า (LINE)", row.text || "[ข้อความ]", convId);
        await autoReply(ev.replyToken, convId, isNewContact, src.type === "user", row);
      }
    }
  } catch (e) {
    console.error("line-webhook error:", e?.message || String(e));
  }
  return res.status(200).send("ok");
}
