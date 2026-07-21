// The Top Mentor — cron รายวัน (09:00 ไทย): ส่งแบบสอบถาม Happiness Survey เข้า LINE สมาชิกที่ถึงกำหนดอัตโนมัติ
// เงื่อนไขส่ง: สมาชิกเชื่อม LINE แล้ว + ถึงกำหนด + ยังไม่ส่ง/ยังไม่ทำ + มีลิงก์แบบสอบถามตั้งไว้ในหน้า ตั้งค่า
// Vercel env vars: MENTOR_LINE_ACCESS_TOKEN (+ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
// เรียกเองเพื่อทดสอบ: GET /api/mentor-cron?dry=1 (ดูว่าจะส่งให้ใคร โดยไม่ส่งจริง)

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = () => process.env.MENTOR_LINE_ACCESS_TOKEN || "";
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

const HS = [
  { key: "m3", label: "Happiness Survey 3 เดือน", days: 90, link: "link3" },
  { key: "m6", label: "Happiness Survey 6 เดือน", days: 180, link: "link6" },
  { key: "m12", label: "Happiness Survey 12 เดือน (ก่อนต่ออายุ)", days: 365, link: "link12" },
];
const DEF_TPL = "เรียนคุณ {nick} ({name})\nถึงกำหนดทำแบบสอบถาม {survey} ของ Chapter The Top แล้วครับ/ค่ะ\nรบกวนตอบแบบสอบถามได้ที่ลิงก์นี้\n{link}\nขอบคุณครับ/ค่ะ 🙏";

function pd(iso) { if (!iso) return null; const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
// "วันนี้" ตามเวลาไทย (UTC+7)
function todayTH() { const t = new Date(Date.now() + 7 * 3600e3); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); }

// ถึงกำหนดส่งหรือยัง — ตรรกะเดียวกับในแอป: 3/6 เดือน = start+90/180 วัน, 12 เดือน = เปิดส่งได้ 180 วันก่อนวันครบรอบปีถัดไป
function isDue(startIso, h) {
  const s = pd(startIso); if (!s) return false;
  const today = todayTH();
  let due = addDays(s, h.days);
  let open = due;
  if (h.key === "m12") {
    if (due < today) { const nx = new Date(due); while (nx < today) nx.setUTCFullYear(nx.getUTCFullYear() + 1); due = nx; }
    open = addDays(due, -180);
  }
  return today >= open;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const dry = !!(req.query && req.query.dry);
  if (!TOKEN()) return res.status(200).json({ ok: false, reason: "MENTOR_LINE_ACCESS_TOKEN not set" });

  const [mr, cr] = await Promise.all([
    fetch(`${SB()}/rest/v1/tm_members?select=id,data`, { headers: sbH() }),
    fetch(`${SB()}/rest/v1/tm_config?key=eq.main&select=value`, { headers: sbH() }),
  ]);
  const rows = mr.ok ? await mr.json() : [];
  const cfg = ((cr.ok ? await cr.json() : [])[0] || {}).value || {};
  const tpl = cfg.tpl || DEF_TPL;

  const sent = [], skippedNoLink = [];
  for (const row of rows) {
    const m = row.data || {};
    if (!m.lineUserId) continue;
    let changed = false;
    const first = (m.status || "").trim() === "ปีแรก";
    for (const h of HS) {
      // 3+6 เดือน = เฉพาะปีแรก · 12 เดือน = เฉพาะเกิน 1 ปี (ตามสถานะสมาชิก)
      if (h.key === "m12" ? first : !first) continue;
      const rec = (m.hs && m.hs[h.key]) || { sent: false, done: false, note: "" };
      if (rec.sent || rec.done) continue;
      if (!isDue(m.start, h)) continue;
      const link = cfg[h.link];
      if (!link) { skippedNoLink.push(`${m.nick || m.name} · ${h.key}`); continue; }
      const text = tpl.replace(/\{nick\}/g, m.nick || m.name).replace(/\{name\}/g, m.name)
        .replace(/\{survey\}/g, h.label).replace(/\{link\}/g, link);
      if (dry) { sent.push({ member: m.nick || m.name, survey: h.key, dry: true }); continue; }
      const lr = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ to: m.lineUserId, messages: [{ type: "text", text }] }),
      });
      if (lr.ok) {
        rec.sent = true; rec.sentAt = new Date().toISOString(); rec.sentVia = "line-auto";
        m.hs = { ...(m.hs || {}), [h.key]: rec };
        changed = true;
        sent.push({ member: m.nick || m.name, survey: h.key });
      } else {
        sent.push({ member: m.nick || m.name, survey: h.key, error: lr.status });
      }
    }
    if (changed && !dry) {
      await fetch(`${SB()}/rest/v1/tm_members?id=eq.${encodeURIComponent(row.id)}`, {
        method: "PATCH", headers: sbH(), body: JSON.stringify({ data: m }),
      });
    }
  }
  return res.status(200).json({ ok: true, dry, sent, skippedNoLink });
}
