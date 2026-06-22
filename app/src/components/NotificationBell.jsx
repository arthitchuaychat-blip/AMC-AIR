import React from "react";
import { listNotifications, countUnreadNotifications, markNotificationRead, markAllNotificationsRead } from "../lib/api";
import { pushSupported, notifyPermission, enablePush } from "../lib/push";
import { UIcon } from "../icons";

const CAT_ICON = { team_chat: "💬", task: "📋", job: "🔧", hr: "🧑‍💼", customer_chat: "💬" };
const fmtWhen = (s) => { const d = new Date(s), now = Date.now(), diff = (now - d.getTime()) / 1000;
  if (diff < 60) return "เมื่อสักครู่"; if (diff < 3600) return Math.floor(diff / 60) + " นาทีที่แล้ว";
  if (diff < 86400) return Math.floor(diff / 3600) + " ชม.ที่แล้ว";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }); };

// Header bell: unread badge + dropdown list. onOpen(moduleId) navigates the SPA.
export default function NotificationBell({ onOpen }) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState([]);
  const [unread, setUnread] = React.useState(0);
  const [perm, setPerm] = React.useState(notifyPermission());
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef(null);

  async function enable() {
    setBusy(true);
    try { await enablePush(); setPerm(notifyPermission()); }
    catch (e) { alert(e.message || "เปิดการแจ้งเตือนนอกแอปไม่สำเร็จ"); }
    setBusy(false);
  }

  async function refresh() { try { setUnread(await countUnreadNotifications()); } catch (_) {} }
  async function loadList() { try { setItems(await listNotifications(40)); } catch (_) {} }
  React.useEffect(() => { refresh(); const t = setInterval(refresh, 30000); return () => clearInterval(t); }, []);
  React.useEffect(() => { if (open) loadList(); }, [open]);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc); return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function click(n) {
    if (!n.read_at) { try { await markNotificationRead(n.id); } catch (_) {} refresh(); setItems((xs) => xs.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)); }
    if (n.url && onOpen) { onOpen(n.url); setOpen(false); }
  }
  async function readAll() { try { await markAllNotificationsRead(); setItems((xs) => xs.map((x) => ({ ...x, read_at: x.read_at || new Date().toISOString() }))); setUnread(0); } catch (_) {} }

  return (
    <div className="nb" ref={ref}>
      <button className="nb-btn" onClick={() => setOpen((v) => !v)} title="การแจ้งเตือน" aria-label="การแจ้งเตือน">
        🔔{unread > 0 && <span className="nb-badge">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="nb-pop">
          <div className="nb-head"><b>การแจ้งเตือน</b>{unread > 0 && <button className="nb-readall" onClick={readAll}>อ่านทั้งหมด</button>}</div>
          <div className="nb-list">
            {items.length === 0 && <div className="nb-empty">ยังไม่มีการแจ้งเตือน</div>}
            {items.map((n) => (
              <button key={n.id} className={"nb-item" + (n.read_at ? "" : " unread")} onClick={() => click(n)}>
                <span className="nb-ic">{CAT_ICON[n.category] || "🔔"}</span>
                <span className="nb-body">
                  <span className="nb-title">{n.title}</span>
                  {n.body && <span className="nb-sub">{n.body}</span>}
                  <span className="nb-when">{fmtWhen(n.created_at)}</span>
                </span>
                {!n.read_at && <span className="nb-dot" />}
              </button>
            ))}
          </div>
          <div className="nb-foot">
            {!pushSupported() ? <span className="nb-foot-dim">อุปกรณ์นี้ไม่รองรับการแจ้งเตือนนอกแอป</span>
              : perm === "granted" ? <span className="nb-foot-ok">✓ แจ้งเตือนนอกแอป (Push) เปิดอยู่</span>
              : perm === "denied" ? <span className="nb-foot-dim">การแจ้งเตือนถูกบล็อก — เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์ (มือถือ iPhone ต้อง “เพิ่มลงหน้าโฮม” ก่อน)</span>
              : <button className="nb-enable" disabled={busy} onClick={enable}>🔔 {busy ? "กำลังเปิด…" : "เปิดแจ้งเตือนเด้งนอกแอป (Push)"}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
