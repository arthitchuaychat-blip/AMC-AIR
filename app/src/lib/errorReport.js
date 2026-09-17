import { supabase } from "./supabase";

// เก็บ error จากเครื่องผู้ใช้ลงตาราง client_errors (mig 20260917120000) — เพื่อ "รู้ปัญหาก่อนพนักงานมาบอก"
//
// ความเป็นส่วนตัว (ตามเจตนาเดิมของ ErrorBoundary ที่ไม่ส่ง stack ออกข้างนอก):
//   · เก็บใน Supabase ของเราเอง (ที่เดียวกับข้อมูลลูกค้าอยู่แล้ว) ไม่ส่งบริการภายนอก
//   · เก็บเฉพาะ message + stack ตัดสั้น + componentStack — ไม่เก็บ props/state/ข้อมูลฟอร์ม
//   · RLS: insert ได้เฉพาะของตัวเอง · อ่านได้เฉพาะ admin/exec
// กติกาของตัวรายงาน:
//   · ห้ามโยน error ออกจากตัวเองเด็ดขาด (ตัวรายงาน error ต้องไม่ทำหน้าพังเพิ่ม) — ตารางยังไม่มี/เน็ตหลุด = เงียบ
//   · จำกัดอัตรา: ข้อความเดิมส่งซ้ำได้ครั้งเดียวต่อนาที · รวมไม่เกิน 10 ครั้ง/นาที (กัน loop ยิงรัว)
//   · error จากการโหลด chunk หลัง deploy ไม่ต้องรายงาน (main.jsx/ErrorBoundary รีโหลดเองอยู่แล้ว)
const CHUNK_RE = /dynamically imported module|module script failed|error loading dynamically|Failed to fetch.*\.js|ChunkLoadError|Loading chunk|vite:preloadError/i;
const recent = new Map();
let sentThisMinute = 0, minuteStart = 0;

export async function reportClientError(kind, err, extra = {}) {
  try {
    const message = String(err?.message || err || "").slice(0, 500);
    if (!message || CHUNK_RE.test(message)) return;
    const now = Date.now();
    if (now - minuteStart > 60000) { minuteStart = now; sentThisMinute = 0; }
    if (sentThisMinute >= 10) return;
    const key = kind + "|" + message;
    if (recent.get(key) && now - recent.get(key) < 60000) return;
    recent.set(key, now); sentThisMinute++;
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;   // RLS ให้ insert เฉพาะผู้ล็อกอิน (หน้า login พัง → ดูจาก console เหมือนเดิม)
    await supabase.from("client_errors").insert({
      user_id: user.id,
      build: (typeof window !== "undefined" && window.__amcBuild) || null,
      url: typeof location !== "undefined" ? (location.hash || location.pathname || "").slice(0, 200) : null,
      kind,
      message,
      stack: String(err?.stack || "").slice(0, 1500),
      component_stack: String(extra.componentStack || "").slice(0, 1500),
      ua: typeof navigator !== "undefined" ? String(navigator.userAgent || "").slice(0, 200) : null,
    });
  } catch { /* ตัวรายงาน error ห้ามพังเอง */ }
}

// ติดตั้งครั้งเดียวตอนเปิดแอป — จับ error ที่ React ErrorBoundary ไม่เห็น (event handler / promise ที่ไม่ได้ await)
export function installGlobalErrorReporting() {
  if (typeof window === "undefined" || window.__amcErrHooked) return;
  window.__amcErrHooked = true;
  window.addEventListener("error", (e) => { reportClientError("window.error", e?.error || e?.message); });
  window.addEventListener("unhandledrejection", (e) => { reportClientError("unhandledrejection", e?.reason); });
}
