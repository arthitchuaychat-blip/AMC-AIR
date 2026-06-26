// Shared definitions for ใบส่งมอบงาน (job handover) — used by the editor AND the printed sheet so
// the on-screen form and the PDF stay in lockstep.

// การวัดประสิทธิภาพ — [label, kind]
//   kind "ck"   → ปกติ / ไม่ปกติ  (stored 'ok' | 'bad' | '')
//   kind = unit → free measured value written by the tech (stored as a string)
export const PERF_ROWS = [
  ["มอเตอร์พัดลมคอยล์เย็น (FCU)", "ck"],
  ["สัญญาณไฟหน้าเครื่องคอยล์เย็น", "ck"],
  ["มอเตอร์บานสวิง บน-ล่าง", "ck"],
  ["มอเตอร์บานสวิง ซ้าย-ขวา", "ck"],
  ["แรงลมหน้าคอยล์เย็น (FCU)", "Km/h"],
  ["อุณหภูมิลมส่งคอยล์เย็น (FCU)", "°C"],
  ["อุณหภูมิลมกลับคอยล์เย็น (FCU)", "°C"],
  ["มอเตอร์พัดลมคอยล์ร้อน (CDU)", "ck"],
  ["อุณหภูมิลมส่งคอยล์ร้อน (CDU)", "°C"],
  ["อุณหภูมิลมกลับคอยล์ร้อน (CDU)", "°C"],
  ["กระแสไฟฟ้า", "A"],
  ["แรงดันไฟฟ้า", "V"],
  ["แรงดันน้ำยาด้านดูด", "PSI"],
  ["การทำงานของคอมเพรสเซอร์", "ck"],
];

// การดำเนินการงาน · งานล้าง/PM — ได้ทำ / ไม่ได้ทำ (stored 'done' | 'not' | null)
export const PM_ROWS = [
  "ถอดอุปกรณ์แยกชิ้นส่วน (FCU) ล้างทำความสะอาด",
  "ถอดแผ่นกรองอากาศ FILTER ล้างทำความสะอาด",
  "ถอด BLOWER ล้างทำความสะอาด",
  "อัดฉีดท่อน้ำทิ้งไล่เมือกตะกรัน",
  "ล้างทำความสะอาดฟินคอยล์เย็น (EVAP COIL INDOOR UNIT)",
  "ล้างทำความสะอาดฟินคอยล์ร้อน (CONDENSER COIL OUTDOOR UNIT)",
  "เช็ครั่วเซอร์วิสวาล์ว",
  "วัดแรงดันน้ำยา (สารทำความเย็น)",
  "ตรวจสอบมอเตอร์พัดลมคอยล์เย็น",
  "ตรวจสอบมอเตอร์พัดลมคอยล์ร้อน",
  "ตรวจสอบแรงดันไฟ และ กระแสไฟ",
  "ตรวจสอบวงจรควบคุมอุณหภูมิ รีโมท และสวิตช์เบรกเกอร์เปิดปิด",
  "ตรวจสอบการทำงานของคอมเพรสเซอร์",
  "ตรวจสอบประสิทธิภาพโดยรวมเครื่องปรับอากาศ",
  "เช็คความแน่น นอต สกรู",
];

// ประเภทงาน — value ↔ label (also pre-ticked from a job's job_type via JOBTYPE_TO_WORK)
export const WORK_TYPES = [
  ["install", "ติดตั้ง"],
  ["maintenance", "ล้าง"],
  ["move", "ย้าย"],
  ["repair", "ซ่อม"],
  ["survey_install", "สำรวจงานติดตั้ง"],
  ["survey_repair", "สำรวจงานซ่อม"],
  ["other", "อื่น ๆ"],
];

// เครื่องปรับอากาศ — ประเภท
export const AC_TYPES = ["ติดผนัง", "แขวน", "ฝังฝ้า", "เปลือย"];

// map a job_orders.job_type → the handover work-type value to pre-tick
export const JOBTYPE_TO_WORK = { install: "install", maintenance: "maintenance", repair: "repair", survey: "survey_install", other: "other" };

export const FORM_KINDS = [
  { kind: "perf", label: "วัดประสิทธิภาพ", icon: "🌡️", hint: "ก่อน/หลัง 14 รายการ" },
  { kind: "pm", label: "งานล้าง / PM", icon: "🧊", hint: "เช็คลิสต์ 15 ข้อ" },
];

export const blankMachine = () => ({ code: "", type: "", building: "", floor: "", room: "", brand: "", model: "", btu: "" });

export function blankForm(kind) {
  if (kind === "pm") return { kind: "pm", machine: blankMachine(), rows: PM_ROWS.map(() => null), note: "" };
  return { kind: "perf", machine: blankMachine(), rows: PERF_ROWS.map(() => ({ b: "", a: "" })), note: "" };
}

// build a fresh handover, optionally pre-filled from a job order (jo may be null = standalone)
export function blankHandover(jo) {
  const wt = jo && JOBTYPE_TO_WORK[jo.job_type] ? [JOBTYPE_TO_WORK[jo.job_type]] : [];
  const schedAt = jo && ((jo.visits && jo.visits.length && jo.visits[0].scheduled_at) || jo.scheduled_at);
  return {
    job_no: jo?.job_no || null,
    customer_id: jo?.customer_id || null,
    customer_name: jo?.customerName || "",
    contact_name: jo?.contact_name || "",
    contact_phone: jo?.contact_phone || "",
    address: jo?.address || jo?.customerAddr || "",
    doc_ref: jo?.quote_no || "",
    doc_date: schedAt ? String(schedAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
    work_types: wt,
    detail: jo?.details || "",
    fix_note: "",
    forms: [blankForm("perf")],
    tech_sign_url: "", tech_name: "",
    cust_sign_url: "", cust_name: "",
    status: "draft",
  };
}
