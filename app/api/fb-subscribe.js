// One-time helper: subscribe the connected Page to this app's webhook for messages.
// Open in a browser:  /api/fb-subscribe?token=<FB_VERIFY_TOKEN>
// (auth'd by the verify token so it's not public). Uses FB_PAGE_ACCESS_TOKEN (+ FB_PAGE_ID) on the server.
import { GRAPH, pageToken, pageId, listPages } from "./_fb.js";

export default async function handler(req, res) {
  if ((req.query.token || "") !== process.env.FB_VERIFY_TOKEN) return res.status(403).send("forbidden");
  if (!process.env.FB_PAGE_ACCESS_TOKEN) return res.status(200).json({ ok: false, msg: "ยังไม่ได้ตั้ง FB_PAGE_ACCESS_TOKEN ใน Vercel" });
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const pid = pageId();
  // ยังไม่ได้ตั้ง FB_PAGE_ID → โชว์รายชื่อเพจ (id + ชื่อ) ให้เลือกไปตั้งใน Vercel
  if (!pid) {
    const pages = await listPages();
    return res.status(200).json({
      need_setup: "ยังไม่ได้ตั้ง FB_PAGE_ID — เลือก id ของเพจ 'AMC AIR แอร์บ้าน ติดตั้งฟรี' จากรายการด้านล่าง แล้วไปเพิ่มตัวแปร FB_PAGE_ID ใน Vercel (ค่า = id นั้น) → redeploy → เปิดลิงก์นี้อีกครั้ง",
      your_pages: pages,
    });
  }

  // มี page id แล้ว → แลกโทเค็นเพจ แล้วสมัคร webhook ให้เพจนั้น
  const token = await pageToken();
  const who = await fetch(`${GRAPH}/${pid}?fields=id,name&access_token=${token}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  const sub = await fetch(`${GRAPH}/${pid}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_echoes&access_token=${token}`, { method: "POST" })
    .then((r) => r.json()).catch((e) => ({ error: String(e) }));
  const check = await fetch(`${GRAPH}/${pid}/subscribed_apps?access_token=${token}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));

  return res.status(200).json({ page: who, subscribe_result: sub, current_subscriptions: check });
}
