// ⏳ "รอตอบ" ของแชตลูกค้า (v854 · mig 20260918190000_chat_waiting)
// waiting_since = เวลาที่ลูกค้าเริ่มรอ (trigger ฝั่ง DB ตั้งเมื่อข้อความขาเข้าแรกหลังเราตอบ · ล้างเมื่อเราตอบ/กด "ไม่ต้องตอบ")
// คนละเรื่องกับ unread — unread ถูกล้างทันทีที่มีคนเปิดห้องแม้ยังไม่ได้ตอบ ห้องจึงหลุดจากสายตา
// lvl: new < 1 ชม. · warm 1–4 ชม. · hot ≥ 4 ชม.
export const waitInfo = (c, now) => {
  if (!c || !c.waiting_since) return null;
  const ts = new Date(c.waiting_since).getTime();
  if (!Number.isFinite(ts)) return null;
  const min = Math.max(0, Math.floor(((now || Date.now()) - ts) / 60000));
  const t = min < 60 ? `${min} น.` : min < 1440 ? `${Math.floor(min / 60)} ชม.` : `${Math.floor(min / 1440)} วัน`;
  return { min, t, lvl: min >= 240 ? "hot" : min >= 60 ? "warm" : "new" };
};
export const WAIT_STYLE = {
  new: { background: "#fef9c3", color: "#854d0e", borderColor: "#fde68a" },
  warm: { background: "#ffedd5", color: "#9a3412", borderColor: "#fdba74" },
  hot: { background: "#fee2e2", color: "#b42318", borderColor: "#fca5a5" },
};
// ตัวกรองด่วนของรายชื่อแชต — ใช้ร่วมกับ dropdown สถานะ/ผู้รับผิดชอบ (AND กัน)
export const quickMatch = (c, quickF, myId) =>
  quickF === "unread" ? (Number(c.unread) || 0) > 0
  : quickF === "waiting" ? !!c.waiting_since
  : quickF === "mine" ? !!myId && c.assigned_to === myId
  : quickF === "pinned" ? !!c.pinned
  : true;
// เรียงโหมด "รอตอบ": คนที่รอนานสุดขึ้นก่อน
export const byWaitingLongest = (a, b) => new Date(a.waiting_since || 0) - new Date(b.waiting_since || 0);
