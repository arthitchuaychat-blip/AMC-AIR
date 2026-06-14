// Job scheduling helpers — time slots + multi-day ranges.
// Shared by the Job Order editor and the Schedule calendar so both agree on
// how a job's day-range and time-slot are derived from (scheduled_at, end_date, slot).

export const SLOTS = [
  { id: "morning",   th: "เช้า",     time: "10:00–13:00", start: "10:00", icon: "🌅" },
  { id: "afternoon", th: "บ่าย",     time: "14:00–17:00", start: "14:00", icon: "🌇" },
  { id: "full",      th: "เต็มวัน",   time: "ทั้งวัน",       start: "08:00", icon: "☀️" },
  { id: "custom",    th: "กำหนดเอง",  time: "เลือกเวลาเอง",  start: "08:00", icon: "⏰" },
];
// the three display buckets used by the calendar grid (custom collapses into morning/afternoon)
export const BUCKETS = [
  { id: "full",      th: "เต็มวัน", time: "ทั้งวัน" },
  { id: "morning",   th: "เช้า",    time: "10:00–13:00" },
  { id: "afternoon", th: "บ่าย",    time: "14:00–17:00" },
];

// job categories — [value, label, icon, color] · shared by the editor, list filter and calendar
export const JOB_TYPES = [
  ["survey", "สำรวจหน้างาน", "🔍", "#2563eb"],
  ["install", "ติดตั้ง", "🔧", "#16a34a"],
  ["repair", "ซ่อม/แก้ไข", "🛠️", "#d97706"],
  ["maintenance", "ล้าง/บำรุงรักษา", "🧊", "#0891b2"],
  ["other", "อื่น ๆ", "📋", "#6b7280"],
];
export const jobTypeDef = (t) => JOB_TYPES.find((x) => x[0] === t) || JOB_TYPES[1];

// shared job/visit statuses — [value, label, badge-class, color]
export const JOB_STATUSES = [
  ["pending", "รอจ่ายงาน", "b-grey", "#7c899c"],
  ["scheduled", "นัดแล้ว", "b-blue", "#2563eb"],
  ["in_progress", "กำลังทำงาน", "b-amber", "#ea8a04"],
  ["awaiting_approval", "รออนุมัติ", "b-purple", "#7c3aed"],
  ["reschedule", "รอนัดหมายใหม่", "b-orange", "#ea580c"],
  ["done", "เสร็จ", "b-green", "#16a34a"],
  ["cancelled", "ยกเลิกแล้ว", "b-red", "#dc2626"],
];
export const jobStatusColor = (s) => (JOB_STATUSES.find((x) => x[0] === s) || JOB_STATUSES[0])[3];
export const jobStatusDef = (s) => JOB_STATUSES.find((x) => x[0] === s) || JOB_STATUSES[0];
export const jobStatusLabel = (s) => jobStatusDef(s)[1];

// a job's overall status, derived from its visits (รอบ): done only when every active visit is done;
// otherwise the most "actionable" status wins (in_progress > awaiting_approval > reschedule > scheduled > pending)
export function deriveJobStatus(visits) {
  const active = (visits || []).filter((v) => v.status !== "cancelled");
  if (!active.length) return (visits && visits.length) ? "cancelled" : "pending";
  if (active.every((v) => v.status === "done")) return "done";
  for (const s of ["in_progress", "awaiting_approval", "reschedule", "scheduled", "pending"]) {
    if (active.some((v) => v.status === s)) return s;
  }
  return "scheduled";
}

export const slotDef = (id) => SLOTS.find((s) => s.id === id) || null;
export const slotStartTime = (id, fallback) => slotDef(id)?.start || fallback || "08:00";

const p = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
const THMON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const THDOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
export const thDayMon = (d) => `${d.getDate()} ${THMON[d.getMonth()]}`;
export const thDow = (d) => THDOW[d.getDay()];
export const thMonthYear = (d) => `${THMON[d.getMonth()]} ${d.getFullYear() + 543}`;

// which display bucket a job falls in: 'full' | 'morning' | 'afternoon'
export function slotBucket(jo) {
  if (jo.slot === "full") return "full";
  if (jo.slot === "morning") return "morning";
  if (jo.slot === "afternoon") return "afternoon";
  // custom / legacy job with no slot → derive from the scheduled hour
  const h = jo.scheduled_at ? new Date(jo.scheduled_at).getHours() : 8;
  return h >= 13 ? "afternoon" : "morning";
}

// the list of yyyy-mm-dd days a job covers (start date from scheduled_at, through end_date)
export function jobDays(jo) {
  if (!jo.scheduled_at) return [];
  const start = new Date(jo.scheduled_at);
  const startYmd = ymd(start);
  if (!jo.end_date || jo.end_date <= startYmd) return [startYmd];
  const days = [];
  const cur = parseYmd(startYmd), end = parseYmd(jo.end_date);
  while (cur <= end) { days.push(ymd(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
}

// do two jobs clash? overlapping day-range AND overlapping slot (full collides with everything)
export function jobsOverlap(a, b) {
  const da = new Set(jobDays(a));
  if (!jobDays(b).some((d) => da.has(d))) return false;
  const ba = slotBucket(a), bb = slotBucket(b);
  return ba === "full" || bb === "full" || ba === bb;
}

// human label for a job's schedule, e.g. "13 มิ.ย. · เช้า" or "13–15 มิ.ย. · เต็มวัน" or "13 มิ.ย. · 09:30 น."
export function scheduleLabel(jo) {
  if (!jo.scheduled_at) return "ยังไม่นัด";
  const start = new Date(jo.scheduled_at);
  const def = slotDef(jo.slot);
  const slotTxt = (!jo.slot || jo.slot === "custom")
    ? start.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) + " น."
    : def.th;
  const days = jobDays(jo);
  if (days.length > 1) {
    const end = parseYmd(days[days.length - 1]);
    return `${thDayMon(start)}–${thDayMon(end)} · ${slotTxt} · ${days.length} วัน`;
  }
  return `${thDayMon(start)} · ${slotTxt}`;
}
