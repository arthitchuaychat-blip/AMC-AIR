/* AMC Management service worker — Web Push notifications for team chat.
   Intentionally has NO fetch handler / no caching: the app must always load the latest
   build straight from the network (see vercel.json cache rules). */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = {}; }
  const title = d.title || "ข้อความใหม่";
  const body = d.body || "";
  const url = d.url || "/";
  const tag = d.tag || "teamchat";
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body, tag, renotify: true,
      icon: "/logo.png", badge: "/logo.png",
      data: { url },
    });
    if (typeof d.badge === "number" && self.navigator && self.navigator.setAppBadge) {
      try { d.badge > 0 ? await self.navigator.setAppBadge(d.badge) : await self.navigator.clearAppBadge(); } catch (_) {}
    } else if (self.navigator && self.navigator.setAppBadge) {
      try { await self.navigator.setAppBadge(); } catch (_) {}
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) { if ("focus" in c) { try { await c.navigate(url); } catch (_) {} return c.focus(); } }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
