// Web Push client helpers — register the service worker, subscribe the device, store the
// subscription in Supabase. The server (app/api/push-send.js) sends notifications to these.
import { supabase } from "./supabase";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function urlB64ToUint8Array(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

let _swReg = null;
export async function registerSW() {
  if (!pushSupported()) return null;
  if (_swReg) return _swReg;
  _swReg = await navigator.serviceWorker.register("/sw.js");
  return _swReg;
}

export function notifyPermission() {
  return pushSupported() ? Notification.permission : "unsupported"; // "default" | "granted" | "denied" | "unsupported"
}

async function vapidKey() {
  const r = await fetch("/api/push-key");
  if (!r.ok) throw new Error("ยังไม่ได้ตั้งค่า VAPID บนเซิร์ฟเวอร์");
  const { key } = await r.json();
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า VAPID_PUBLIC_KEY");
  return key;
}

// request permission + subscribe + persist. Returns true if subscribed.
export async function enablePush() {
  if (!pushSupported()) throw new Error("อุปกรณ์/เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("ยังไม่ได้อนุญาตการแจ้งเตือน");
  const reg = await registerSW();
  const key = await vapidKey();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(key) });
  const j = sub.toJSON();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("ยังไม่ได้เข้าสู่ระบบ");
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: navigator.userAgent.slice(0, 200),
  }, { onConflict: "endpoint" });
  if (error) throw error;
  return true;
}

// quietly re-register + re-subscribe if the user already granted permission (called on app load)
export async function autoResubscribe() {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return;
    await enablePush();
  } catch (_) { /* ignore — silent best-effort */ }
}

export async function disablePush() {
  try {
    const reg = await registerSW();
    const sub = reg && (await reg.pushManager.getSubscription());
    if (sub) { await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); }
  } catch (_) {}
}
