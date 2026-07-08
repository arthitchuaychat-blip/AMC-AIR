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

// ส่งมอบงานล้าง — วัดก่อนล้าง/หลังล้าง (ต่อเครื่อง) = 14 แถวเดิม + 2 ข้อสำคัญหลังล้าง
export const CLEAN_ROWS = [
  ...PERF_ROWS,
  ["น้ำทิ้งไหลสะดวก ไม่รั่วซึม", "ck"],
  ["เสียง / การสั่นสะเทือน", "ck"],
];

// ส่งมอบงานซ่อม — ตรวจก่อนซ่อม/หลังซ่อม (ต่อเครื่อง)
export const REPAIR_ROWS = [
  ["การทำงานของคอมเพรสเซอร์", "ck"],
  ["มอเตอร์พัดลมคอยล์เย็น (FCU)", "ck"],
  ["มอเตอร์พัดลมคอยล์ร้อน (CDU)", "ck"],
  ["แผงควบคุม / เมนบอร์ด", "ck"],
  ["รีโมท / เซ็นเซอร์อุณหภูมิ", "ck"],
  ["การทำความเย็น", "ck"],
  ["กระแสไฟฟ้า", "A"],
  ["แรงดันไฟฟ้า", "V"],
  ["แรงดันน้ำยาด้านดูด", "PSI"],
  ["อุณหภูมิลมส่งคอยล์เย็น (FCU)", "°C"],
  ["อุณหภูมิลมกลับคอยล์เย็น (FCU)", "°C"],
  ["น้ำทิ้ง / รอยรั่วซึม", "ck"],
  ["เสียง / การสั่นสะเทือน", "ck"],
];

// ตรวจรับงานติดตั้งหลายเครื่อง (ส่งมอบรวม) — [หมวด, [ข้อตรวจ...]] · ติ๊ก ✓ ผ่าน / ✕ ไม่ผ่าน แยกรายเครื่อง
export const ACCEPT_GROUPS = [
  ["งานติดตั้ง", [
    "เครื่องยึดแน่นหนา ได้ระดับ (คอยล์เย็น + คอยล์ร้อน)",
    "ตำแหน่งคอยล์ร้อนระบายอากาศได้ดี มีระยะห่างจากผนังเหมาะสม",
    "รางครอบท่อ/แนวท่อเก็บเรียบร้อย สวยงาม",
  ]],
  ["ระบบน้ำยา", [
    "แวคคั่มระบบตามมาตรฐาน / ทดสอบรั่ว แรงดันคงที่",
    "แรงดันน้ำยาตามสเปคเครื่อง (R32 / R410A)",
    "หุ้มฉนวนท่อครบถ้วน ไม่มีเหงื่อ/น้ำแข็งเกาะ",
  ]],
  ["ระบบไฟฟ้า", [
    "เบรกเกอร์แยก + ขนาดสายไฟถูกต้องตามพิกัดเครื่อง",
    "วัดแรงดันไฟ/กระแส (แอมป์) อยู่ในเกณฑ์ปกติ",
    "จุดต่อสายแน่นหนา มีสายดินครบ",
  ]],
  ["ระบบน้ำทิ้ง", [
    "เทสต์น้ำทิ้ง ไหลสะดวก ไม่รั่วซึม ความลาดเอียงเพียงพอ",
  ]],
  ["ทดสอบการทำงาน", [
    "เปิดทดสอบ ความเย็นปกติ (วัดอุณหภูมิลมออก)",
    "รีโมททำงานครบทุกโหมด (สวิง / พัดลม / ตั้งเวลา)",
    "เสียงและการสั่นสะเทือนปกติ ทั้งคอยล์เย็นและคอยล์ร้อน",
  ]],
];
export const ACCEPT_ROWS = ACCEPT_GROUPS.flatMap(([, rows]) => rows);   // 13 ข้อ (ติ๊กรายเครื่อง)
// ความเรียบร้อยรวมทั้งงาน — ติ๊กครั้งเดียว ไม่แยกเครื่อง
export const ACCEPT_OVERALL = [
  "เก็บกวาดหน้างาน ขนเศษวัสดุออกครบ",
  "สาธิต/อธิบายการใช้งานให้ผู้ใช้งาน",
  "ส่งมอบรีโมท คู่มือ ใบรับประกันครบถ้วน",
  "ถ่ายรูปงานเสร็จครบทุกจุดติดตั้ง",
];
export const blankAcceptMachine = () => ({ point: "", brand: "", model: "", btu: "", serial: "" });

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

// ทุกชนิดที่ระบบรู้จัก (รวมชนิดเก่า perf/pm — ใบเก่าที่บันทึกไว้ยังเปิด/พิมพ์ได้ปกติ)
export const FORM_KINDS = [
  { kind: "accept", label: "ส่งมอบงานติดตั้ง", icon: "🧰", hint: "หลายเครื่องใน 1 ฟอร์ม — เช็คลิสต์ 13 ข้อรายเครื่อง + ความเรียบร้อยรวม + รูปส่งมอบไม่จำกัด" },
  { kind: "clean", label: "ส่งมอบงานล้าง", icon: "🧊", hint: "ต่อเครื่อง — สิ่งที่ทำ 15 ข้อ + วัดก่อน/หลังล้าง 16 รายการ + รูปก่อน/หลัง อย่างละ 4" },
  { kind: "repair", label: "ส่งมอบงานซ่อม", icon: "🛠️", hint: "ต่อเครื่อง — ตรวจก่อน/หลังซ่อม 13 รายการ + อะไหล่ที่เปลี่ยน + รูปก่อน/หลัง อย่างละ 4" },
  { kind: "perf", label: "วัดประสิทธิภาพ (แบบเดิม)", icon: "🌡️", hint: "ก่อน/หลัง 14 รายการ" },
  { kind: "pm", label: "งานล้าง / PM (แบบเดิม)", icon: "🧊", hint: "เช็คลิสต์ 15 ข้อ" },
];
// 3 แบบหลักที่ให้เลือกตอนกด "เพิ่มแบบฟอร์ม" (แบบเดิมซ่อนจากเมนู แต่ใบเก่ายังเปิดได้)
export const ADD_KINDS = ["accept", "clean", "repair"];

export const blankMachine = () => ({ code: "", type: "", building: "", floor: "", room: "", brand: "", model: "", btu: "" });

export function blankForm(kind) {
  if (kind === "pm") return { kind: "pm", machine: blankMachine(), rows: PM_ROWS.map(() => null), note: "" };
  // ตรวจรับงานรวม: rows[ข้อ][เครื่อง] = 'pass' | 'fail' | null · itemNotes ต่อข้อ (ใช้เมื่อไม่ผ่าน) · overall = ติ๊กรวมทั้งงาน · photos = รูปส่งมอบ (ไม่จำกัด)
  if (kind === "accept") return { kind: "accept", machines: [blankAcceptMachine()], rows: ACCEPT_ROWS.map(() => [null]), itemNotes: ACCEPT_ROWS.map(() => ""), overall: ACCEPT_OVERALL.map(() => false), photos: [], note: "" };
  // งานล้าง: acts = สิ่งที่ทำ (15 ข้อ ได้ทำ/ไม่ได้ทำ) · rows = วัดก่อน/หลังล้าง · รูปก่อน/หลัง อย่างละ ≤4
  if (kind === "clean") return { kind: "clean", machine: blankMachine(), acts: PM_ROWS.map(() => null), rows: CLEAN_ROWS.map(() => ({ b: "", a: "" })), photosBefore: [], photosAfter: [], note: "" };
  // งานซ่อม: rows = ตรวจก่อน/หลังซ่อม · fix = สิ่งที่ซ่อม/อะไหล่ที่เปลี่ยน · รูปก่อน/หลัง อย่างละ ≤4
  if (kind === "repair") return { kind: "repair", machine: blankMachine(), rows: REPAIR_ROWS.map(() => ({ b: "", a: "" })), fix: "", photosBefore: [], photosAfter: [], note: "" };
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
