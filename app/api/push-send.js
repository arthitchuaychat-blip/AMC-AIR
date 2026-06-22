// Send a Web Push notification to every member of a chat room except the sender.
// Called (fire-and-forget) by the client right after a team-chat message is inserted.
// Auth: the caller's Supabase JWT identifies the sender; recipients are derived server-side.
import webpush from "web-push";

const SB = () => process.env.SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbH = () => ({ apikey: KEY(), Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" });

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return res.status(200).json({ ok: false, reason: "no-vapid" }); // not configured yet — no-op

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "no auth" });
  const ur = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${token}` } });
  if (!ur.ok) return res.status(401).json({ error: "unauthorized" });
  const sender = await ur.json();

  const { roomId, userIds, title, body, url } = await readJson(req);
  if (!roomId && !(Array.isArray(userIds) && userIds.length)) return res.status(400).json({ error: "missing roomId/userIds" });

  // recipients: explicit userIds (notification center) OR all members of a chat room — minus the sender
  let members;
  if (Array.isArray(userIds) && userIds.length) {
    members = [...new Set(userIds)].filter((id) => id && id !== sender.id);
  } else {
    const mr = await fetch(`${SB()}/rest/v1/chat_members?room_id=eq.${encodeURIComponent(roomId)}&select=user_id`, { headers: sbH() });
    members = (mr.ok ? await mr.json() : []).map((m) => m.user_id).filter((id) => id && id !== sender.id);
  }
  if (!members.length) return res.status(200).json({ ok: true, sent: 0 });

  // their device subscriptions
  const inList = members.map((id) => `"${id}"`).join(",");
  const sr = await fetch(`${SB()}/rest/v1/push_subscriptions?user_id=in.(${inList})&select=endpoint,p256dh,auth`, { headers: sbH() });
  const subs = sr.ok ? await sr.json() : [];
  if (!subs.length) return res.status(200).json({ ok: true, sent: 0 });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@amcair.net", pub, priv);
  const payload = JSON.stringify({ title: title || "การแจ้งเตือนใหม่", body: (body || "").slice(0, 180), url: url || "/", tag: roomId ? `room-${roomId}` : "notif" });

  const dead = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 1800 });
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.endpoint); // expired → clean up
    }
  }));
  if (dead.length) {
    const del = dead.map((e) => `"${e}"`).join(",");
    await fetch(`${SB()}/rest/v1/push_subscriptions?endpoint=in.(${del})`, { method: "DELETE", headers: sbH() }).catch(() => {});
  }
  return res.status(200).json({ ok: true, sent: subs.length - dead.length });
}
