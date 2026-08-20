// เติมชื่อ + รูปโปรไฟล์ย้อนหลังให้ผู้ติดต่อ Facebook เก่า (ที่ทักเข้ามาก่อนตั้ง Page Token)
// เรียกครั้งเดียว: GET https://app.amcair.net/api/fb-backfill?key=<CRON_SECRET>
// ใช้ Messenger User Profile API (first_name+last_name+profile_pic) ด้วย Page Access Token
import { GRAPH, pageToken } from "./_fb.js";

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

export default async function handler(req, res) {
  // กันยิงมั่ว: ต้องแนบ ?key=<CRON_SECRET> ให้ตรง
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: "ตั้ง CRON_SECRET ใน Vercel ก่อน" });
  if ((req.query?.key || "") !== secret) return res.status(403).json({ error: "forbidden — แนบ ?key=<CRON_SECRET> ให้ถูก" });
  if (!SB() || !KEY()) return res.status(503).json({ error: "ขาด SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });

  const token = await pageToken();
  if (!token) return res.status(503).json({ error: "ขาด FB_PAGE_ACCESS_TOKEN" });

  // ผู้ติดต่อที่ยังไม่มีชื่อ หรือยังไม่มีรูป
  const rows = await fetch(`${SB()}/rest/v1/fb_contacts?or=(display_name.is.null,picture_url.is.null)&select=psid,display_name,picture_url&limit=200`, { headers: sbH() })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []);

  let updated = 0, failed = 0;
  const details = [];
  for (const c of rows) {
    try {
      const p = await fetch(`${GRAPH}/${c.psid}?fields=first_name,last_name,profile_pic&access_token=${token}`).then((r) => r.json());
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || null;
      const pic = p.profile_pic || null;
      if (!name && !pic) { failed++; details.push({ psid: c.psid, err: p.error?.message || "ไม่พบโปรไฟล์" }); continue; }
      const patch = {};
      if (name && !c.display_name) patch.display_name = name;
      if (pic) patch.picture_url = pic;   // รูปหมดอายุได้ → รีเฟรชทับทุกครั้ง
      if (!Object.keys(patch).length) continue;
      const up = await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(c.psid)}`, { method: "PATCH", headers: sbH(), body: JSON.stringify(patch) });
      if (up.ok) updated++; else { failed++; details.push({ psid: c.psid, err: "patch " + up.status }); }
    } catch (e) { failed++; details.push({ psid: c.psid, err: String(e) }); }
  }
  return res.status(200).json({ scanned: rows.length, updated, failed, details: details.slice(0, 20) });
}
