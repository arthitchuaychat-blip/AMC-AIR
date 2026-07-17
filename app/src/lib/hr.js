// HR scheduling + attendance math — pure functions (no DOM/network), so they're easy to test.

export const WORK_PATTERNS = [
  { id: "mon_sat", label: "จันทร์–เสาร์" },
  { id: "mon_fri", label: "จันทร์–ศุกร์" },
  { id: "mon_fri_alt_sat", label: "จันทร์–ศุกร์ + เสาร์เว้นเสาร์" },
  { id: "none", label: "ไม่กำหนด (ไม่คิดขาด/สาย)" },
];
export const patternLabel = (id) => (WORK_PATTERNS.find((p) => p.id === id) || {}).label || id;

export const LEAVE_TYPES = [
  { id: "sick", label: "ลาป่วย" },
  { id: "personal", label: "ลากิจ" },
  { id: "vacation", label: "ลาพักร้อน" },
  { id: "unpaid", label: "ลาไม่รับค่าแรง" },   // ไม่มีโควตา — พนักงานรายเดือนถูกหักค่าแรงตามวัน/ชม.ที่ลา (mig 141)
];
export const leaveLabel = (id) => (LEAVE_TYPES.find((t) => t.id === id) || {}).label || id;

// ---- ลาราย ชม. (mig 141): แถวใบลามี hours/time_from/time_to · 8 ชม. = 1 วัน ----
export const LEAVE_HOURS_PER_DAY = 8;
// แผนที่ user→วัน→{t: ประเภท, h: ชั่วโมง|null} — ใช้ร่วมทุกแท็บ (วันนี้/รายงาน/ประสิทธิผล/เงินเดือน)
export function buildLeaveDaySet(leaves, from, to) {
  const set = {};
  (leaves || []).forEach((l) => {
    for (let d = parseYmd(l.start_date); d <= parseYmd(l.end_date); d.setDate(d.getDate() + 1)) {
      const k = ymd(d);
      if (k >= from && k <= to) (set[l.user_id] = set[l.user_id] || {})[k] = { t: l.type, h: Number(l.hours) > 0 ? Number(l.hours) : null };
    }
  });
  return set;
}
// สัดส่วนวันของใบลา ณ วันหนึ่ง: ลาเต็มวัน = 1 · ลาราย ชม. = ชม./8 (ไม่เกิน 1)
export const leaveFrac = (lv) => (lv && Number(lv.h) > 0 ? Math.min(1, Number(lv.h) / LEAVE_HOURS_PER_DAY) : 1);
// ข้อความจำนวนลาของแถวใบลา: "2 ชม. (08:00–10:00)" หรือ "1.5 วัน"
export const leaveAmountText = (l) => Number(l?.hours) > 0
  ? `${Number(l.hours)} ชม.${l.time_from && l.time_to ? ` (${String(l.time_from).slice(0, 5)}–${String(l.time_to).slice(0, 5)})` : ""}`
  : `${Number(l?.days) || 0} วัน`;

export const DEFAULT_HR_SETTINGS = { start: "08:00", end: "17:00", graceMin: 15, otNeedsApproval: false,
  quota: { vacation: 6, personal: 3, sick: 30 } };

const ymd = (d) => { const x = new Date(d); const p = (n) => String(n).padStart(2, "0"); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; };
const parseYmd = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
// minutes since midnight of a "HH:MM" string or a Date/ISO
export function minutesOf(t) {
  if (!t) return null;
  if (typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t)) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
  const d = new Date(t); return d.getHours() * 60 + d.getMinutes();
}
// weeks since a fixed Monday epoch — used for เสาร์เว้นเสาร์ parity
function weekParity(date) {
  const ref = new Date(2024, 0, 1); // 2024-01-01 is a Monday
  const days = Math.floor((parseYmd(ymd(date)) - ref) / 86400000);
  return Math.floor(days / 7) % 2; // 0 or 1
}

// is this person expected to work on this date?
export function isWorkday(dateStr, pattern, satGroup, holidaySet) {
  if (pattern === "none") return false;
  if (holidaySet && holidaySet.has(dateStr)) return false;
  const dow = parseYmd(dateStr).getDay(); // 0=Sun..6=Sat
  if (dow === 0) return false;             // Sunday off for everyone
  if (dow >= 1 && dow <= 5) return true;   // Mon–Fri always
  if (dow === 6) {                         // Saturday
    if (pattern === "mon_sat") return true;
    if (pattern === "mon_fri") return false;
    if (pattern === "mon_fri_alt_sat") {
      const p = weekParity(dateStr);
      return satGroup === "B" ? p === 1 : p === 0; // A → even weeks, B → odd weeks
    }
  }
  return false;
}

// OT is credited in half-hour blocks, rounded DOWN (per day):
//   < 30 นาที → 0 · 30–59 → 0.5 ชม. · 60–89 → 1 ชม. · 90–119 → 1.5 ชม. …
export const otCreditHours = (min) => Math.floor((Number(min) || 0) / 30) * 0.5;

// derive the day's status + late/ot minutes from an attendance row + settings
export function dayStat(att, settings = DEFAULT_HR_SETTINGS) {
  const start = minutesOf(settings.start || "08:00"), end = minutesOf(settings.end || "17:00");
  const grace = Number(settings.graceMin || 0);
  const ci = att && att.check_in_at ? minutesOf(att.check_in_at) : null;
  const co = att && att.check_out_at ? minutesOf(att.check_out_at) : null;
  const lateMin = ci == null ? 0 : Math.max(0, ci - start);
  const otMin = co == null ? 0 : Math.max(0, co - end);
  const earlyMin = co == null ? 0 : Math.max(0, end - co);
  const isLate = ci != null && ci - start > grace;
  // otHours = the PAID OT for the day (rounded down to the nearest ½ hour)
  return { checkedIn: ci != null, checkedOut: co != null, lateMin, otMin, otHours: otCreditHours(otMin), earlyMin, isLate };
}

export const fmtMin = (m) => { m = Math.round(Number(m) || 0); const h = Math.floor(m / 60), mm = m % 60; return h ? `${h} ชม. ${mm} น.` : `${mm} น.`; };
export const fmtTime = (t) => { if (!t) return "-"; const d = new Date(t); const p = (n) => String(n).padStart(2, "0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; };
export const todayYmd = () => ymd(new Date());
export { ymd as hrYmd, parseYmd as hrParseYmd };

// จำนวนวันลาของใบลา l ที่ตกในช่วง [from, to] (YYYY-MM-DD) — แบ่งตามสัดส่วนวันปฏิทิน
// ใช้คิดโควตา/ส่วนเกินแบบตัดช่วงเวลา: ใบคร่อมปีหรือคร่อมรอบเงินเดือน จะนับเฉพาะส่วนที่อยู่ในช่วงจริง
export function leaveDaysInRange(l, from, to) {
  const total = Number(l?.days) || 0;
  if (!total || !from || !to || to < from) return 0;
  const s = String(l.start_date), e = String(l.end_date || l.start_date);
  if (e < from || s > to) return 0;
  if (s >= from && e <= to) return total;
  let inR = 0, all = 0;
  for (let d = parseYmd(s); d <= parseYmd(e); d.setDate(d.getDate() + 1)) { all++; const k = ymd(d); if (k >= from && k <= to) inR++; }
  return all ? Math.round(total * inR / all * 100) / 100 : 0;
}
// จำนวนวันลาที่ตกในปี year — ใบคร่อมปี (ธ.ค.–ม.ค.) แบ่งตามสัดส่วนวันปฏิทินของแต่ละปี
export const leaveDaysInYear = (l, year) => leaveDaysInRange(l, `${year}-01-01`, `${year}-12-31`);

// ระยะทางระหว่างพิกัด 2 จุด (กม.) — Haversine · ใช้เตือนเช็คอินไกลจากพิกัดร้าน
export function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371, rad = (x) => (Number(x) * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// inclusive working-day count between two dates for a person (used to size a leave request)
export function leaveDays(startStr, endStr, pattern, satGroup, holidaySet) {
  let n = 0; const s = parseYmd(startStr), e = parseYmd(endStr);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    if (isWorkday(ymd(d), pattern || "mon_sat", satGroup, holidaySet)) n++;
  }
  return n || 1;
}
