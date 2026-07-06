// The Top Mentor — ตั้ง Rich Menu ของ OA อัตโนมัติ (ปุ่ม "ข้อมูลของฉัน" เปิด LIFF)
// เรียกครั้งเดียวหลังตั้ง LIFF: GET /api/mentor-richmenu?go=1
// ลบเมนู: GET /api/mentor-richmenu?clear=1 · ดูสถานะ: GET /api/mentor-richmenu
// ใช้ env: MENTOR_LINE_ACCESS_TOKEN + SUPABASE_URL/SERVICE_ROLE (ดึง liffId จาก tm_config)

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const TOKEN = () => process.env.MENTOR_LINE_ACCESS_TOKEN || "";
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });
const laH = () => ({ Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" });
const IMG_URL = "https://amc-air.vercel.app/mentor/richmenu.png";

async function listMenus() {
  const r = await fetch("https://api.line.me/v2/bot/richmenu/list", { headers: laH() });
  return r.ok ? (await r.json()).richmenus || [] : [];
}
async function deleteAll() {
  const menus = await listMenus();
  for (const m of menus) await fetch(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { method: "DELETE", headers: laH() });
  return menus.length;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (!TOKEN()) return res.status(200).json({ ok: false, reason: "MENTOR_LINE_ACCESS_TOKEN not set" });

  // สถานะ (ไม่มี query)
  if (!req.query.go && !req.query.clear) {
    const menus = await listMenus();
    return res.status(200).json({ ok: true, count: menus.length, menus: menus.map((m) => ({ id: m.richMenuId, name: m.name })) });
  }

  if (req.query.clear) {
    const n = await deleteAll();
    return res.status(200).json({ ok: true, cleared: n });
  }

  // ?go=1 — สร้างเมนูใหม่ (ลบของเดิมก่อนกันซ้ำ)
  const cfg = await fetch(`${SB()}/rest/v1/tm_config?key=eq.main&select=value`, { headers: sbH() });
  const liffId = ((cfg.ok ? await cfg.json() : [])[0]?.value || {}).liffId;
  if (!liffId) return res.status(200).json({ ok: false, reason: "ยังไม่ได้ตั้ง liffId ใน tm_config" });
  const liffUrl = `https://liff.line.me/${liffId}`;

  await deleteAll();

  // 1) สร้าง object เมนู (2500x843 ปุ่มเดียวเต็มพื้นที่)
  const body = {
    size: { width: 2500, height: 843 },
    selected: true,
    name: "The Top Mentor — เมนูสมาชิก",
    chatBarText: "📋 ข้อมูลของฉัน",
    areas: [{ bounds: { x: 0, y: 0, width: 2500, height: 843 }, action: { type: "uri", uri: liffUrl } }],
  };
  const cr = await fetch("https://api.line.me/v2/bot/richmenu", { method: "POST", headers: laH(), body: JSON.stringify(body) });
  if (!cr.ok) return res.status(502).json({ ok: false, step: "create", error: await cr.text().catch(() => cr.status) });
  const richMenuId = (await cr.json()).richMenuId;

  // 2) อัพโหลดรูป (ดึงจาก public แล้วส่งเข้า LINE)
  const img = await fetch(IMG_URL);
  if (!img.ok) return res.status(502).json({ ok: false, step: "fetch-image", error: img.status });
  const buf = Buffer.from(await img.arrayBuffer());
  const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST", headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "image/png" }, body: buf,
  });
  if (!up.ok) return res.status(502).json({ ok: false, step: "upload-image", error: await up.text().catch(() => up.status) });

  // 3) ตั้งเป็นเมนูเริ่มต้นของทุกคน
  const def = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, { method: "POST", headers: laH() });
  if (!def.ok) return res.status(502).json({ ok: false, step: "set-default", error: await def.text().catch(() => def.status) });

  return res.status(200).json({ ok: true, richMenuId, liffUrl, chatBarText: body.chatBarText });
}
