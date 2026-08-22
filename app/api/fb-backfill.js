// เติมชื่อ + รูปโปรไฟล์ย้อนหลังให้ผู้ติดต่อ Facebook เก่า (ที่ทักเข้ามาก่อนตั้ง Page Token)
// เรียกครั้งเดียว: GET https://app.amcair.net/api/fb-backfill?key=<CRON_SECRET>
// ใช้ Messenger User Profile API (first_name+last_name+profile_pic) ด้วย Page Access Token
import { GRAPH, pageToken, cacheImage, fetchFbProfile } from "./_fb.js";

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

const OFFICE = ["admin", "exec", "sales", "field_sales", "finance", "hr"];

export default async function handler(req, res) {
  if (!SB() || !KEY()) return res.status(503).json({ error: "ขาด SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
  // อนุญาต 2 ทาง: (1) ?key=<CRON_SECRET> · (2) ล็อกอินทีมออฟฟิศ (JWT) → กดจากในแอปได้เลย
  let ok = false;
  const secret = process.env.CRON_SECRET;
  if (secret && (req.query?.key || "") === secret) ok = true;
  if (!ok) {
    const jwt = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (jwt) {
      const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } });
      if (ur.ok) {
        const user = await ur.json();
        const prof = await fetch(`${SB()}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        if (OFFICE.includes(prof[0]?.role)) ok = true;
      }
    }
  }
  if (!ok) return res.status(403).json({ error: "forbidden — ล็อกอินทีมออฟฟิศ หรือแนบ ?key=<CRON_SECRET>" });

  const token = await pageToken();
  if (!token) return res.status(503).json({ error: "ขาด FB_PAGE_ACCESS_TOKEN" });
  // ตรวจว่า token ที่ resolve ได้เป็นของ "เพจ" จริงไหม (ถ้าเป็น system user = แลก page token ไม่สำเร็จ = ดึงโปรไฟล์ไม่ได้)
  let whoami = null;
  try { whoami = await fetch(`${GRAPH}/me?fields=id,name&access_token=${token}`).then((r) => r.json()); } catch (e) { whoami = { error: String(e) }; }
  const pageIdEnv = process.env.FB_PAGE_ID || null;
  const tokenIsPage = !!(whoami && whoami.id && pageIdEnv && String(whoami.id) === String(pageIdEnv));
  // โหมดตรวจ ?probe=1 — ทดสอบวิธีดึงชื่อแบบต่าง ๆ กับผู้ติดต่อ 1 ราย แล้วคืนผลดิบ (ไม่แก้ข้อมูล)
  if (req.query?.probe) {
    const one = await fetch(`${SB()}/rest/v1/fb_contacts?display_name=is.null&select=psid&limit=1`, { headers: sbH() }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    const psid = one[0]?.psid;
    const out = { whoami, pageIdEnv, tokenIsPage, psid };
    if (psid) {
      out.direct = await fetch(`${GRAPH}/${psid}?fields=first_name,last_name,profile_pic&access_token=${token}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
      out.conv = await fetch(`${GRAPH}/${pageIdEnv}/conversations?user_id=${psid}&fields=participants,senders&access_token=${token}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
    }
    let td = null; try { td = await fetch(`${GRAPH}/debug_token?input_token=${token}&access_token=${token}`).then((r) => r.json()); } catch (e) { td = { error: String(e) }; }
    out.scopes = td?.data?.scopes || td;
    return res.status(200).json(out);
  }

  // ผู้ติดต่อที่ยังไม่มีชื่อ/รูป → ดึงโปรไฟล์ + เก็บรูปเข้า storage เรา · ทีละ 30 คน/รอบ (กัน timeout)
  const rows = await fetch(`${SB()}/rest/v1/fb_contacts?or=(display_name.is.null,picture_url.is.null)&select=psid,display_name,picture_url&order=last_message_at.desc.nullslast&limit=30`, { headers: sbH() })
    .then((r) => (r.ok ? r.json() : [])).catch(() => []);

  let updated = 0, failed = 0;
  const details = [];
  for (const c of rows) {
    const d = { psid: c.psid };
    try {
      const { name, picUrl } = await fetchFbProfile(c.psid, token, pageIdEnv);   // ชื่อผ่าน Conversations API
      d.gotName = !!name; d.gotPic = !!picUrl;
      let pic = null;
      if (picUrl) {
        const cached = await cacheImage(`fb/${c.psid}.jpg`, picUrl);
        d.cached = cached ? "ok" : "cache-failed";
        pic = cached || picUrl;
      }
      if (!name && !pic) { failed++; d.result = "no-profile"; details.push(d); continue; }
      const patch = {};
      if (name && !c.display_name) patch.display_name = name;
      if (pic) patch.picture_url = pic;   // ทับรูปเดิม (FB CDN หมดอายุ) ด้วย URL storage เรา
      if (!Object.keys(patch).length) { d.result = "nothing-to-update"; details.push(d); continue; }
      const up = await fetch(`${SB()}/rest/v1/fb_contacts?psid=eq.${encodeURIComponent(c.psid)}`, { method: "PATCH", headers: { ...sbH(), Prefer: "return=minimal" }, body: JSON.stringify(patch) });
      if (up.ok) { updated++; d.result = "updated"; d.newPic = patch.picture_url ? patch.picture_url.slice(0, 60) + "…" : null; }
      else { failed++; d.result = "patch-" + up.status; d.patchBody = (await up.text().catch(() => "")).slice(0, 120); }
      details.push(d);
    } catch (e) { failed++; d.result = "exception"; d.err = String(e); details.push(d); }
  }
  return res.status(200).json({ scanned: rows.length, updated, failed, tokenSet: !!token, whoami, pageIdEnv, tokenIsPage, details: details.slice(0, 5) });
}
