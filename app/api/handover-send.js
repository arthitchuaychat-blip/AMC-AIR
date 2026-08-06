// Send a handover's public link to the customer via LINE (office only).
//   POST /api/handover-send   body: { id }   headers: Authorization: Bearer <supabase jwt>
// Looks up the customer's linked LINE user, pushes the read-only link. If not linked, returns the
// link so the office can copy/send it manually. Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LINE_CHANNEL_ACCESS_TOKEN
const { shareToken } = require("./handover-view");
const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const OFFICE = ["admin", "sales", "exec", "finance", "hr"];

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  let stage = "init";
  try {
    if (!SB() || !KEY()) return res.status(503).json({ error: "server not configured (SUPABASE_URL/SERVICE_ROLE_KEY)" });
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ error: "no auth" });
    // identify caller + gate to office roles
    stage = "auth";
    const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
    if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
    const user = await ur.json();
    stage = "profile";
    const pr = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() });
    const prof = (pr.ok ? await pr.json() : [])[0];
    if (!OFFICE.includes(prof?.role)) return res.status(403).json({ error: "forbidden" });

    stage = "readbody";
    const { id } = await readJson(req);
    if (!id) return res.status(400).json({ error: "missing id" });
    stage = "handover";
    const hr = await fetch(`${SB()}/rest/v1/job_handovers?id=eq.${encodeURIComponent(id)}&select=id,customer_id,customer_name,job_no,status&limit=1`, { headers: sbH() });
    const ho = (hr.ok ? await hr.json() : [])[0];
    if (!ho) return res.status(404).json({ error: "not found" });
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const url = `https://${host}/?ho=${ho.id}&t=${shareToken(ho.id)}`;

    // find a LINE user linked to this customer (mig 081 many-to-many, then legacy single)
    let lineUid = null;
    if (ho.customer_id != null) {
      const l1 = await fetch(`${SB()}/rest/v1/line_contact_customers?customer_id=eq.${encodeURIComponent(ho.customer_id)}&select=line_user_id&limit=1`, { headers: sbH() });
      lineUid = ((l1.ok ? await l1.json() : [])[0] || {}).line_user_id || null;
      if (!lineUid) {
        const l2 = await fetch(`${SB()}/rest/v1/line_contacts?customer_id=eq.${encodeURIComponent(ho.customer_id)}&select=line_user_id&limit=1`, { headers: sbH() });
        lineUid = ((l2.ok ? await l2.json() : [])[0] || {}).line_user_id || null;
      }
    }
    if (!lineUid) return res.status(200).json({ ok: true, sent: false, url, reason: "ลูกค้ายังไม่ได้ผูก LINE — คัดลอกลิงก์ส่งเอง" });
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) return res.status(200).json({ ok: true, sent: false, url, reason: "ยังไม่ได้ตั้งค่า LINE ฝั่งเซิร์ฟเวอร์ — คัดลอกลิงก์ส่งเอง" });

    stage = "line-push";
    const text = `🧾 ใบส่งมอบงาน${ho.job_no ? ` (${ho.job_no})` : ""}\nกดดูเอกสารส่งมอบงาน:\n${url}`;
    const r = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
      body: JSON.stringify({ to: lineUid, messages: [{ type: "text", text }] }),
    });
    if (!r.ok) return res.status(502).json({ error: "line: " + (await r.text().catch(() => r.status)), url });
    // log to the LINE chat thread so it shows in the in-app conversation
    const sent = await r.json().catch(() => ({}));
    const sentMsg = (sent.sentMessages || [])[0] || {};
    await fetch(`${SB()}/rest/v1/line_messages`, { method: "POST", headers: sbH(), body: JSON.stringify({ line_user_id: lineUid, direction: "out", sent_by: user.id, line_message_id: sentMsg.id || null, type: "text", text }) }).catch(() => {});
    await fetch(`${SB()}/rest/v1/line_contacts?line_user_id=eq.${encodeURIComponent(lineUid)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify({ last_message: "[ใบส่งมอบงาน]", last_message_at: new Date().toISOString() }) }).catch(() => {});
    return res.status(200).json({ ok: true, sent: true, url });
  } catch (e) {
    return res.status(500).json({ error: `error@${stage}: ` + (e.message || e) });
  }
};
