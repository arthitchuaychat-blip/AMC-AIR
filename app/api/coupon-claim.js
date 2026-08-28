// ออกคูปองให้ลูกค้า (public) — ตรวจโควตา + กันแจกซ้ำ + สุ่มโค้ดไม่ซ้ำ → คืนโค้ด
// ใช้ได้ทั้งเว็บฟอร์ม (amcair.net), แชต LINE/FB, และพนักงานออกให้หน้าร้าน
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
const genCode = (prefix) => { const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let r = ""; for (let i = 0; i < 5; i++) r += s[Math.floor(Math.random() * s.length)]; return `${prefix}-${r}`; };
const sbGet = async (path) => { const r = await fetch(`${SB()}/rest/v1/${path}`, { headers: H() }); return r.ok ? r.json() : []; };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");   // เว็บฟอร์มอยู่คนละโดเมน (amcair.net)
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  try {
    const b = await readJson(req);
    const campaign = String(b.campaign || "clean750").trim();
    const name = String(b.name || "").trim();
    const phone = String(b.phone || "").replace(/[^0-9+]/g, "").trim();
    const source = String(b.source || "web").trim();
    const line_user_id = b.line_user_id || null, fb_id = b.fb_id || null;
    const consent = !!b.consent;
    if (!consent) return res.status(400).json({ error: "consent", message: "กรุณายินยอมให้เก็บข้อมูลก่อนรับคูปอง" });
    if (!name || (!phone && !line_user_id && !fb_id)) return res.status(400).json({ error: "missing", message: "กรุณากรอกชื่อและเบอร์โทร" });

    const camp = (await sbGet(`promo_campaigns?id=eq.${encodeURIComponent(campaign)}&select=*`))[0];
    if (!camp || !camp.active) return res.status(404).json({ error: "no_campaign", message: "แคมเปญนี้ปิดรับแล้ว" });
    if (camp.claim_until && new Date(camp.claim_until + "T23:59:59") < new Date()) return res.status(400).json({ error: "closed", message: "หมดเวลารับคูปองแล้ว" });

    // กันแจกซ้ำ (เบอร์/LINE/FB) → มีโค้ดแล้วคืนโค้ดเดิม
    const dq = [];
    if (phone) dq.push(`phone.eq.${encodeURIComponent(phone)}`);
    if (line_user_id) dq.push(`line_user_id.eq.${encodeURIComponent(line_user_id)}`);
    if (fb_id) dq.push(`fb_id.eq.${encodeURIComponent(fb_id)}`);
    const findExisting = async () => (dq.length ? (await sbGet(`promo_coupons?campaign_id=eq.${encodeURIComponent(campaign)}&or=(${dq.join(",")})&select=code&limit=1`))[0] : null);
    const ex0 = await findExisting();
    if (ex0) return res.status(200).json({ code: ex0.code, value: camp.value, already: true, message: "คุณรับคูปองไปแล้ว" });

    // โควตา
    if (camp.quota > 0) {
      const r = await fetch(`${SB()}/rest/v1/promo_coupons?campaign_id=eq.${encodeURIComponent(campaign)}&status=neq.void&select=code`, { headers: { ...H(), Prefer: "count=exact", Range: "0-0" } });
      const total = Number((r.headers.get("content-range") || "").split("/")[1] || 0);
      if (total >= camp.quota) return res.status(200).json({ full: true, message: "ขออภัย คูปองแจกครบ 100 รางวัลแล้ว" });
    }

    // สุ่มโค้ด + insert (retry กันชนโค้ด PK / ชน unique เบอร์-line-fb)
    const prefix = "CLN" + (Math.round(Number(camp.value)) || "");
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = genCode(prefix);
      const row = { code, campaign_id: campaign, status: "claimed", name, phone: phone || null, source, line_user_id, fb_id, consent };
      const r = await fetch(`${SB()}/rest/v1/promo_coupons`, { method: "POST", headers: { ...H(), Prefer: "return=minimal" }, body: JSON.stringify(row) });
      if (r.ok) return res.status(200).json({ code, value: camp.value });
      const txt = await r.text();
      if (/duplicate key.*code|promo_coupons_pkey/i.test(txt)) continue;   // โค้ดชน → สุ่มใหม่
      if (/promo_coupons_uq_/i.test(txt)) { const ex = await findExisting(); if (ex) return res.status(200).json({ code: ex.code, value: camp.value, already: true, message: "คุณรับคูปองไปแล้ว" }); }
      return res.status(500).json({ error: "insert", message: txt.slice(0, 200) });
    }
    return res.status(500).json({ error: "code_gen", message: "ออกโค้ดไม่สำเร็จ กรุณาลองใหม่" });
  } catch (e) { return res.status(500).json({ error: String(e?.message || e) }); }
}
