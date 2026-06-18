// One-time helper: subscribe the connected Page to this app's webhook for messages.
// Open in a browser:  /api/fb-subscribe?token=<FB_VERIFY_TOKEN>
// (auth'd by the verify token so it's not public). Uses FB_PAGE_ACCESS_TOKEN on the server.
const GRAPH = "https://graph.facebook.com/v19.0";

export default async function handler(req, res) {
  if ((req.query.token || "") !== process.env.FB_VERIFY_TOKEN) return res.status(403).send("forbidden");
  const page = process.env.FB_PAGE_ACCESS_TOKEN;
  if (!page) return res.status(200).json({ ok: false, msg: "ยังไม่ได้ตั้ง FB_PAGE_ACCESS_TOKEN" });

  // which page does this token belong to?
  const who = await fetch(`${GRAPH}/me?fields=id,name&access_token=${page}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));
  // subscribe this page to the app for the message fields
  const sub = await fetch(`${GRAPH}/me/subscribed_apps?subscribed_fields=messages,messaging_postbacks,message_echoes&access_token=${page}`, { method: "POST" })
    .then((r) => r.json()).catch((e) => ({ error: String(e) }));
  // read back current subscription
  const check = await fetch(`${GRAPH}/me/subscribed_apps?access_token=${page}`).then((r) => r.json()).catch((e) => ({ error: String(e) }));

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(200).json({ page: who, subscribe_result: sub, current_subscriptions: check });
}
