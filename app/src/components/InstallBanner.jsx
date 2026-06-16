import React from "react";
import { UIcon } from "../icons";
import { onInstallChange, canInstall, promptInstall, isStandalone, isIOS } from "../lib/pwa";
import { pushSupported, notifyPermission, enablePush } from "../lib/push";

const DISMISS_KEY = "amc-install-dismissed";

// Adaptive nudge shown app-wide after login:
//  • not installed (Android) → "ติดตั้งแอป" button (native prompt)
//  • not installed (iPhone)  → short Add-to-Home-Screen instructions
//  • installed but notifications off → "เปิดแจ้งเตือน" button
export default function InstallBanner() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [dismissed, setDismissed] = React.useState(() => localStorage.getItem(DISMISS_KEY) === "1");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => onInstallChange(force), []);

  const dismiss = () => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); };

  // already installed → only nudge notifications if not yet decided
  if (isStandalone()) {
    if (!pushSupported() || notifyPermission() !== "default") return null;
    return (
      <div className="install-bar">
        <span className="install-ic">🔔</span>
        <div className="install-tx"><b>เปิดแจ้งเตือนแชตทีม</b><span>รับข้อความใหม่ทันทีแม้ปิดแอป</span></div>
        <button className="btn-primary sm" disabled={busy} onClick={async () => {
          setBusy(true);
          try { await enablePush(); } catch (e) { alert(e.message || "เปิดแจ้งเตือนไม่สำเร็จ"); }
          setBusy(false); force();
        }}>เปิดแจ้งเตือน</button>
      </div>
    );
  }

  if (dismissed) return null;

  if (canInstall()) {
    return (
      <div className="install-bar">
        <span className="install-ic">⬇️</span>
        <div className="install-tx"><b>ติดตั้งแอปลงหน้าจอ</b><span>เปิดได้เร็ว + รับแจ้งเตือนเหมือน LINE</span></div>
        <button className="btn-primary sm" onClick={async () => { await promptInstall(); force(); }}>ติดตั้งแอป</button>
        <button className="install-x" aria-label="ปิด" onClick={dismiss}><UIcon name="x" size={16} /></button>
      </div>
    );
  }

  if (isIOS()) {
    return (
      <div className="install-bar">
        <span className="install-ic">📲</span>
        <div className="install-tx"><b>เพิ่มแอปลงหน้าจอ iPhone</b><span>กดปุ่มแชร์ ⬆️ ด้านล่าง → “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอน</span></div>
        <button className="install-x" aria-label="ปิด" onClick={dismiss}><UIcon name="x" size={16} /></button>
      </div>
    );
  }

  return null; // desktop / unsupported
}
