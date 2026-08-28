// Facebook Messenger webhook — verify (GET) + receive messages (POST), store into fb_contacts/fb_messages.
// Env: FB_VERIFY_TOKEN, FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET (optional, for signature check), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import crypto from "crypto";
import webpush from "web-push";
import { GRAPH, pageToken, pageId, cacheImage, fetchFbProfile } from "./_fb.js";
import { getAutoReplyCfg, isOpenNow, generateReply } from "./_ai.js";

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

// แจ้งเตือนออฟฟิศ (ขาย/ธุรการ/ผู้บริหาร) + ผู้รับผิดชอบแชตนี้ ว่ามีข้อความ FB เข้า — bell + web push (best-effort)
async function notifyFbChat(psid, name, preview) {
  try {
    const cfgR = await fetch(`${SB()}/rest/v1/app_config?key=eq.notify_settings&select=value`, { headers: sbH() });
    const cfg = (cfgR.ok ? ((await cfgR.json())[0]?.value) : null) || {};
    const pr = await fetch(`${SB()}/rest/v1/profiles?role=in.("sales","admin","exec")&select=id,role`, { headers: sbH() });
    const profs = pr.ok ? await pr.json() : [];
    const roleIds = profs.filter((p) => { const s = cfg[p.role]; return !s || s.customer_chat !== false; }).map((p) => p.id);
    let assignedTo = null;
    try { const cr = await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}&select=assigned_to`, { headers: sbH() }); if (cr.ok) assignedTo = (await cr.json())[0]?.assigned_to || null; } catch (_) { /* ignore */ }
    const ids = [...new Set([...roleIds, ...(assignedTo ? [assignedTo] : [])])];
    if (!ids.length) return;
    const title = `💬 ${name || "ลูกค้า Facebook"}`;
    await fetch(`${SB()}/rest/v1/notifications`, { method: "POST", headers: sbH(), body: JSON.stringify(ids.map((id) => ({ user_id: id, category: "customer_chat", title, body: (preview || "").slice(0, 180), url: "chat", ref_type: "fb", ref_no: psid || null }))) });
    const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return;
    const inList = ids.map((id) => `"${id}"`).join(",");
    const sr = await fetch(`${SB()}/rest/v1/push_subscriptions?user_id=in.(${inList})&select=endpoint,p256dh,auth`, { headers: sbH() });
    const subs = sr.ok ? await sr.json() : [];
    if (!subs.length) return;
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@amcair.net", pub, priv);
    const payload = JSON.stringify({ title, body: (preview || "").slice(0, 180), url: "/#chat", tag: "notif" });
    await Promise.all(subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 1800 }).catch(() => {})));
  } catch (_) { /* ignore */ }
}

async function rawBody(req) {
  const chunks = []; for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

// ส่งข้อความจากเพจไปหาลูกค้า (บอท) + บันทึกลง fb_messages/fb_contacts
async function sendFbText(psid, text, token) {
  try {
    const r = await fetch(`${GRAPH}/${pageId() || "me"}/messages?access_token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: psid }, messaging_type: "RESPONSE", message: { text } }),
    });
    if (!r.ok) return false;
    const out = await r.json().catch(() => ({}));
    await fetch(`${SB()}/rest/v1/fb_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid, direction: "out", type: "text", text, fb_message_id: out.message_id || null, sent_by: null }) });
    await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ last_message: text, last_message_at: new Date().toISOString() }) });
    return true;
  } catch { return false; }
}
// กล่องดำบอท (เหมือน ai_bot_last ของ LINE) — ไล่สาเหตุตอนบอทเงียบ
async function aiBlackboxFb(psid, q, extra) {
  try {
    await fetch(`${SB()}/rest/v1/app_config?on_conflict=key`, {
      method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: "ai_bot_last_fb", value: { at: new Date().toISOString(), conv: String(psid).slice(-8), q: String(q || "").slice(0, 80), ...extra } }),
    });
  } catch { /* ห้ามพังงานหลัก */ }
}
// 🎟️ คูปอง/โปรโมชั่นในแชต FB — 1 โปร มี "โค้ดโปร" เดียว · พิมพ์โค้ดโปร→เจนรหัสส่วนลดรายคน · พิมพ์ "โปร"→ลิสต์
const couponMoney = (c) => (c.discount_type === "percent" ? c.value + "%" : "฿" + Number(c.value).toLocaleString());
async function couponChatFb(text, psid) {
  const camps = await fetch(`${SB()}/rest/v1/promo_campaigns?active=eq.true&order=created_at.desc&select=*`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const now = new Date();
  const promos = (camps || []).filter((c) => !c.claim_until || new Date(c.claim_until + "T23:59:59") >= now);
  const up = String(text || "").toUpperCase();
  const camp = promos.find((c) => c.public_code && up.includes(String(c.public_code).toUpperCase()));
  if (camp) {
    const findEx = () => fetch(`${SB()}/rest/v1/promo_coupons?campaign_id=eq.${encodeURIComponent(camp.id)}&fb_id=eq.${encodeURIComponent(psid)}&select=code&limit=1`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const ex = await findEx();
    let res = ex[0] ? { code: ex[0].code, already: true } : null;
    if (!res && camp.quota > 0) {
      const r = await fetch(`${SB()}/rest/v1/promo_coupons?campaign_id=eq.${encodeURIComponent(camp.id)}&status=neq.void&select=code`, { headers: { ...sbH(), Prefer: "count=exact", Range: "0-0" } });
      if (Number((r.headers.get("content-range") || "").split("/")[1] || 0) >= camp.quota) res = { full: true };
    }
    if (!res) {
      const pfx = (String(camp.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase()) || "CP";
      const mk = () => { const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let x = ""; for (let i = 0; i < 6; i++) x += s[Math.floor(Math.random() * s.length)]; return pfx + "-" + x; };
      for (let a = 0; a < 6 && !res; a++) {
        const code = mk();
        const rr = await fetch(`${SB()}/rest/v1/promo_coupons`, { method: "POST", headers: { ...sbH(), Prefer: "return=minimal" }, body: JSON.stringify({ code, campaign_id: camp.id, status: "claimed", source: "fb", fb_id: psid, consent: true }) });
        if (rr.ok) res = { code };
        else { const t = await rr.text(); if (/duplicate key.*code|promo_coupons_pkey/i.test(t)) continue; if (/promo_coupons_uq_/i.test(t)) { const e2 = await findEx(); if (e2[0]) res = { code: e2[0].code, already: true }; } else break; }
      }
    }
    if (!res) return null;
    if (res.full) return `ขออภัยครับ โปร "${camp.name}" เต็มโควตาแล้ว 🙏 ติดตามโปรถัดไปได้เลยครับ`;
    return `${res.already ? "คุณรับส่วนลดโปรนี้ไปแล้วครับ 🎟️" : "รับส่วนลดสำเร็จ! 🎉"}\n\n🎟️ ${camp.name}\nรหัสส่วนลดของคุณ: ${res.code}\nส่วนลด: ${couponMoney(camp)}\n\nแจ้งรหัสนี้กับทีมงานตอนนัดใช้บริการได้เลยครับ`;
  }
  if (/โปรโมชั่น|โปรโมท|โปร|ส่วนลด|คูปอง/.test(String(text || ""))) {
    if (!promos.length) return "ตอนนี้ยังไม่มีโปรโมชั่นครับ 🙏 ติดตามได้เร็ว ๆ นี้";
    let s = "🎉 โปรโมชั่นตอนนี้:";
    promos.forEach((c) => { s += `\n\n🎟️ ${c.name} — ลด ${couponMoney(c)}`; if (c.public_code) s += `\n   พิมพ์โค้ด: ${c.public_code}`; if (c.note) s += `\n   (${c.note})`; });
    s += "\n\nพิมพ์โค้ดโปรที่ต้องการ หรือส่งรูปคูปองมา รับรหัสส่วนลดได้เลยครับ 😊";
    return s;
  }
  return null;
}

// บอท AI ตอบเฟซ — ใช้ตั้งค่าชุดเดียวกับ LINE (app_config autoreply)
async function fbAutoReply({ psid, text, token }) {
  try {
    if (!token) return;
    const cfg = await getAutoReplyCfg();
    // 🎟️ โค้ดโปร/คีย์เวิร์ดโปรโมชั่น → ตอบส่วนลด/ลิสต์โปร · คุมด้วย coupon_kw (เปิดโดยปริยาย · ทำงานแม้ปิดบอท AI)
    if (text && cfg?.coupon_kw !== false) {
      const reply = await couponChatFb(text, psid);
      if (reply) { await sendFbText(psid, reply, token); await aiBlackboxFb(psid, text, { ok: true, note: "coupon-chat" }); return; }
    }
    if (!cfg || !cfg.enabled) { await aiBlackboxFb(psid, text, { skip: "autoreply-master-disabled" }); return; }
    const afterHours = !isOpenNow(cfg);
    if (!(cfg.ai_enabled && (afterHours || cfg.ai_always))) { await aiBlackboxFb(psid, text, { skip: !cfg.ai_enabled ? "ai-disabled" : "in-business-hours(ai_always off)" }); return; }
    // ปิดบอทเฉพาะห้องนี้ (ai_off) — พนักงานกำลังคุยปิดการขายเอง · ถ้ายังไม่รัน migration คอลัมน์ ai_off ยังไม่มี → select error → ผ่าน (บอทยังตอบ)
    const ct = await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}&select=ai_off`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    if (ct[0]?.ai_off) { await aiBlackboxFb(psid, text, { skip: "room-ai-off" }); return; }
    // อย่าแทรกถ้าพนักงานเพิ่งตอบเอง (staff-took-over) — มีข้อความ out ที่คนพิมพ์ (sent_by ไม่ว่าง) ใน 30 นาที
    const recent = await fetch(`${SB()}/rest/v1/fb_messages?psid=eq.${encodeURIComponent(psid)}&direction=eq.out&sent_by=not.is.null&select=created_at&order=created_at.desc&limit=1`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    if (recent[0]?.created_at && (Date.now() - new Date(recent[0].created_at).getTime()) < 30 * 60000) { await aiBlackboxFb(psid, text, { skip: "staff-took-over" }); return; }
    // ประวัติแชตล่าสุด → ตอบต่อเนื่อง (ข้อความปัจจุบันถูกบันทึกไปแล้ว)
    const hr = await fetch(`${SB()}/rest/v1/fb_messages?psid=eq.${encodeURIComponent(psid)}&type=eq.text&select=direction,text&order=created_at.desc&limit=10`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    let hist = hr.reverse().filter((m) => (m.text || "").trim()).map((m) => ({ role: m.direction === "in" ? "user" : "assistant", content: m.text }));
    while (hist.length && hist[0].role !== "user") hist.shift();
    if (!hist.length || hist[hist.length - 1].role !== "user") hist.push({ role: "user", content: text });
    const t0 = Date.now();
    const out = await generateReply({ history: hist, cfg, afterHours });
    let sent = false;
    if (out.text) sent = await sendFbText(psid, "🤖 " + out.text, token);
    await aiBlackboxFb(psid, text, { ok: !!out.text && sent, ms: Date.now() - t0, err: out.err || (out.text && !sent ? "fb-send-failed" : null) });
  } catch (e) { await aiBlackboxFb(psid, text, { err: "exception:" + String(e?.message || e) }); }
}

export default async function handler(req, res) {
  // 1) webhook verification handshake
  if (req.method === "GET") {
    const q = req.query || {};
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === process.env.FB_VERIFY_TOKEN) {
      return res.status(200).send(q["hub.challenge"]);
    }
    return res.status(403).send("forbidden");
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  const buf = await rawBody(req);
  // optional signature check
  if (process.env.FB_APP_SECRET) {
    const sig = req.headers["x-hub-signature-256"] || "";
    const expected = "sha256=" + crypto.createHmac("sha256", process.env.FB_APP_SECRET).update(buf).digest("hex");
    if (sig !== expected) return res.status(401).send("bad signature");
  }
  let body = {}; try { body = JSON.parse(buf.toString("utf8") || "{}"); } catch {}
  if (body.object !== "page") return res.status(200).json({ ok: true });

  const token = await pageToken();
  for (const entry of body.entry || []) {
    for (const ev of entry.messaging || []) {
      const psid = ev.sender && ev.sender.id;
      if (!psid || !ev.message || ev.message.is_echo) continue;
      // กันตอบซ้ำเมื่อ Meta ยิง event เดิมซ้ำ (retry) — mid เดิมเคยเก็บแล้ว = ข้าม
      if (ev.message.mid) {
        const dup = await fetch(`${SB()}/rest/v1/fb_messages?fb_message_id=eq.${encodeURIComponent(ev.message.mid)}&select=id&limit=1`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        if (dup.length) continue;
      }
      const text = ev.message.text || null;
      const att = (ev.message.attachments || [])[0];
      const imageUrl = att && att.type === "image" ? att.payload?.url : null;
      const preview = text || (imageUrl ? "[รูปภาพ]" : att ? `[${att.type}]` : "[ข้อความ]");

      // ดึงชื่อ+รูปโปรไฟล์จาก Messenger User Profile API (ใช้ first_name+last_name — ฟิลด์ name ไม่คืนค่าสำหรับผู้ใช้ทั่วไป)
      const fetchProfile = async () => {
        if (!token) return { name: null, pic: null };
        const { name, picUrl } = await fetchFbProfile(psid, token, pageId());
        const pic = picUrl ? (await cacheImage(`fb/${psid}.jpg`, picUrl)) || picUrl : null;   // เก็บรูปเข้า storage เรา (URL FB หมดอายุ)
        return { name, pic };
      };
      // upsert contact (ดึงชื่อตอนติดต่อครั้งแรก · ถ้าติดต่อเก่ายังไม่มีชื่อ ให้เติมย้อนหลัง)
      const exist = await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}&select=psid,unread,display_name`, { headers: sbH() }).then((r) => r.ok ? r.json() : []).catch(() => []);
      if (!exist.length) {
        const { name, pic } = await fetchProfile();
        await fetch(`${SB()}/rest/v1/fb_contacts`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid, display_name: name, picture_url: pic, last_message: preview, last_message_at: new Date().toISOString(), unread: 1 }) });
      } else {
        const cur = Number(exist[0].unread || 0) + 1;
        const patch = { last_message: preview, last_message_at: new Date().toISOString(), unread: cur };
        if (!exist[0].display_name) { const { name, pic } = await fetchProfile(); if (name) patch.display_name = name; if (pic) patch.picture_url = pic; }  // เติมชื่อให้ผู้ติดต่อเก่าที่ยังเป็น "ผู้ใช้ Facebook"
        await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(psid)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify(patch) });
      }
      await fetch(`${SB()}/rest/v1/fb_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ psid, direction: "in", type: imageUrl ? "image" : "text", text, image_url: imageUrl, fb_message_id: ev.message.mid || null }) });
      await notifyFbChat(psid, exist[0]?.display_name || null, preview);   // แจ้งเตือนออฟฟิศ + ผู้รับผิดชอบ
      // บอท AI ตอบอัตโนมัติ (ใช้ตั้งค่าชุดเดียวกับ LINE OA) — เฉพาะข้อความ text
      if (text && text.trim()) await fbAutoReply({ psid, text: text.trim(), token });
    }

    // ── คอมเมนต์ใต้โพสต์ (field 'feed' · mig 193) — ต้องมีสิทธิ์ pages_read_engagement ──
    for (const ch of entry.changes || []) {
      if (ch.field !== "feed") continue;
      const v = ch.value || {};
      if (v.item !== "comment") continue;                      // เอาเฉพาะคอมเมนต์ (ข้าม reaction/like/post)
      const commentId = v.comment_id; if (!commentId) continue;
      if (v.verb === "remove" || v.verb === "hide") {          // ลูกค้าลบ/ซ่อนคอมเมนต์เอง → อัปสถานะ
        await fetch(`${SB()}/rest/v1/fb_comments?comment_id=eq.${encodeURIComponent(commentId)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ status: v.verb === "remove" ? "done" : "hidden", is_hidden: v.verb === "hide" }) }).catch(() => {});
        continue;
      }
      const fromId = v.from && v.from.id;
      if (fromId && fromId === pageId()) continue;             // คอมเมนต์ของเพจเราเอง (ที่เราตอบ) — ไม่ต้องเก็บ/เตือน
      const fromName = (v.from && v.from.name) || null;
      const message = v.message || null;
      // upsert (comment_id unique) — คอมเมนต์เดิมแก้ไข = อัปทับ
      await fetch(`${SB()}/rest/v1/fb_comments`, { method: "POST", headers: { ...sbH(), Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({
        comment_id: commentId, post_id: v.post_id || null,
        parent_id: (v.parent_id && v.parent_id !== v.post_id) ? v.parent_id : null,
        from_id: fromId || null, from_name: fromName, message, permalink: v.permalink_url || null,
        commented_at: v.created_time ? new Date(v.created_time * 1000).toISOString() : new Date().toISOString(),
      }) }).catch(() => {});
      await notifyFbChat(null, `[คอมเมนต์] ${fromName || "Facebook"}`, message);
    }
  }
  return res.status(200).json({ ok: true });
}
