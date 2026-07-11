// Shared definitions for ใบส่งมอบงาน (job handover) — used by the editor AND the printed sheet so
// the on-screen form and the PDF stay in lockstep.

// การวัดประสิทธิภาพ — [label, kind] · ป้ายกำกับ 2 ภาษา ไทย · English (ขึ้นทั้งจอกรอกและใบพิมพ์)
//   kind "ck"   → ปกติ / ไม่ปกติ  (stored 'ok' | 'bad' | '')
//   kind = unit → free measured value written by the tech (stored as a string)
export const PERF_ROWS = [
  ["มอเตอร์พัดลมคอยล์เย็น (FCU) · Indoor fan motor", "ck"],
  ["สัญญาณไฟหน้าเครื่องคอยล์เย็น · Indoor indicator lights", "ck"],
  ["มอเตอร์บานสวิง บน-ล่าง · Vertical swing motor", "ck"],
  ["มอเตอร์บานสวิง ซ้าย-ขวา · Horizontal swing motor", "ck"],
  ["แรงลมหน้าคอยล์เย็น (FCU) · Indoor air flow", "Km/h"],
  ["อุณหภูมิลมส่งคอยล์เย็น (FCU) · Supply air temp", "°C"],
  ["อุณหภูมิลมกลับคอยล์เย็น (FCU) · Return air temp", "°C"],
  ["มอเตอร์พัดลมคอยล์ร้อน (CDU) · Outdoor fan motor", "ck"],
  ["อุณหภูมิลมส่งคอยล์ร้อน (CDU) · Outdoor discharge temp", "°C"],
  ["อุณหภูมิลมกลับคอยล์ร้อน (CDU) · Outdoor intake temp", "°C"],
  ["กระแสไฟฟ้า · Running current", "A"],
  ["แรงดันไฟฟ้า · Voltage", "V"],
  ["แรงดันน้ำยาด้านดูด · Suction pressure", "PSI"],
  ["การทำงานของคอมเพรสเซอร์ · Compressor operation", "ck"],
];

// การดำเนินการงาน · งานล้าง/PM — ได้ทำ / ไม่ได้ทำ (stored 'done' | 'not' | null)
export const PM_ROWS = [
  "ถอดอุปกรณ์แยกชิ้นส่วน (FCU) ล้างทำความสะอาด · Disassemble & clean indoor unit",
  "ถอดแผ่นกรองอากาศ FILTER ล้างทำความสะอาด · Clean air filters",
  "ถอด BLOWER ล้างทำความสะอาด · Remove & clean blower",
  "อัดฉีดท่อน้ำทิ้งไล่เมือกตะกรัน · Flush drain line",
  "ล้างฟินคอยล์เย็น (EVAP COIL INDOOR) · Clean evaporator coil",
  "ล้างฟินคอยล์ร้อน (CONDENSER OUTDOOR) · Clean condenser coil",
  "เช็ครั่วเซอร์วิสวาล์ว · Check service-valve leaks",
  "วัดแรงดันน้ำยา (สารทำความเย็น) · Check refrigerant pressure",
  "ตรวจสอบมอเตอร์พัดลมคอยล์เย็น · Check indoor fan motor",
  "ตรวจสอบมอเตอร์พัดลมคอยล์ร้อน · Check outdoor fan motor",
  "ตรวจสอบแรงดันไฟ และกระแสไฟ · Check voltage & current",
  "ตรวจวงจรควบคุม รีโมท เบรกเกอร์ · Check controls, remote & breaker",
  "ตรวจสอบการทำงานของคอมเพรสเซอร์ · Check compressor operation",
  "ตรวจสอบประสิทธิภาพโดยรวม · Overall performance check",
  "เช็คความแน่น นอต สกรู · Tighten nuts & screws",
];

// ส่งมอบงานล้าง — วัดก่อนล้าง/หลังล้าง (ต่อเครื่อง) = 14 แถวเดิม + 2 ข้อสำคัญหลังล้าง
export const CLEAN_ROWS = [
  ...PERF_ROWS,
  ["น้ำทิ้งไหลสะดวก ไม่รั่วซึม · Drainage flows freely, no leaks", "ck"],
  ["เสียง / การสั่นสะเทือน · Noise / vibration", "ck"],
];

// ส่งมอบงานซ่อม — ตรวจก่อนซ่อม/หลังซ่อม (ต่อเครื่อง)
export const REPAIR_ROWS = [
  ["การทำงานของคอมเพรสเซอร์ · Compressor operation", "ck"],
  ["มอเตอร์พัดลมคอยล์เย็น (FCU) · Indoor fan motor", "ck"],
  ["มอเตอร์พัดลมคอยล์ร้อน (CDU) · Outdoor fan motor", "ck"],
  ["แผงควบคุม / เมนบอร์ด · Control board / mainboard", "ck"],
  ["รีโมท / เซ็นเซอร์อุณหภูมิ · Remote / temp sensor", "ck"],
  ["การทำความเย็น · Cooling performance", "ck"],
  ["กระแสไฟฟ้า · Running current", "A"],
  ["แรงดันไฟฟ้า · Voltage", "V"],
  ["แรงดันน้ำยาด้านดูด · Suction pressure", "PSI"],
  ["อุณหภูมิลมส่งคอยล์เย็น (FCU) · Supply air temp", "°C"],
  ["อุณหภูมิลมกลับคอยล์เย็น (FCU) · Return air temp", "°C"],
  ["น้ำทิ้ง / รอยรั่วซึม · Drainage / leaks", "ck"],
  ["เสียง / การสั่นสะเทือน · Noise / vibration", "ck"],
];

// ตรวจรับงานติดตั้งหลายเครื่อง (ส่งมอบรวม) — [หมวด, [ข้อตรวจ...]] · ติ๊ก ✓ ผ่าน / ✕ ไม่ผ่าน แยกรายเครื่อง
export const ACCEPT_GROUPS = [
  ["งานติดตั้ง · Installation", [
    "เครื่องยึดแน่นหนา ได้ระดับ (คอยล์เย็น + คอยล์ร้อน) · Units mounted securely & level",
    "ตำแหน่งคอยล์ร้อนระบายอากาศดี ระยะห่างเหมาะสม · Outdoor unit well ventilated, proper clearance",
    "รางครอบท่อ/แนวท่อเก็บเรียบร้อย สวยงาม · Trunking / piping neatly finished",
  ]],
  ["ระบบน้ำยา · Refrigerant system", [
    "แวคคั่มระบบตามมาตรฐาน / ทดสอบรั่ว แรงดันคงที่ · Vacuum to standard / leak test, pressure holds",
    "แรงดันน้ำยาตามสเปคเครื่อง (R32 / R410A) · Refrigerant pressure per spec",
    "หุ้มฉนวนท่อครบถ้วน ไม่มีเหงื่อ/น้ำแข็งเกาะ · Pipes fully insulated, no sweating/icing",
  ]],
  ["ระบบไฟฟ้า · Electrical", [
    "เบรกเกอร์แยก + ขนาดสายไฟถูกต้องตามพิกัด · Dedicated breaker + correct cable size",
    "วัดแรงดันไฟ/กระแส (แอมป์) อยู่ในเกณฑ์ปกติ · Voltage/current within normal range",
    "จุดต่อสายแน่นหนา มีสายดินครบ · Tight connections, grounded",
  ]],
  ["ระบบน้ำทิ้ง · Drainage", [
    "เทสต์น้ำทิ้ง ไหลสะดวก ไม่รั่วซึม ลาดเอียงพอ · Drain test: free flow, no leaks, proper slope",
  ]],
  ["ทดสอบการทำงาน · Operation test", [
    "เปิดทดสอบ ความเย็นปกติ (วัดอุณหภูมิลมออก) · Test run: cooling normal (supply temp measured)",
    "รีโมทครบทุกโหมด (สวิง / พัดลม / ตั้งเวลา) · Remote works in all modes",
    "เสียง/การสั่นสะเทือนปกติ ทั้งสองคอยล์ · Normal noise & vibration on both units",
  ]],
];
export const ACCEPT_ROWS = ACCEPT_GROUPS.flatMap(([, rows]) => rows);   // 13 ข้อ (ติ๊กรายเครื่อง)
// ความเรียบร้อยรวมทั้งงาน — ติ๊กครั้งเดียว ไม่แยกเครื่อง
export const ACCEPT_OVERALL = [
  "เก็บกวาดหน้างาน ขนเศษวัสดุออกครบ · Site cleaned, debris removed",
  "สาธิต/อธิบายการใช้งานให้ผู้ใช้งาน · Usage demonstrated to user",
  "ส่งมอบรีโมท คู่มือ ใบรับประกันครบถ้วน · Remote, manual & warranty handed over",
  "ถ่ายรูปงานเสร็จครบทุกจุดติดตั้ง · Completion photos at all points",
];
export const blankAcceptMachine = () => ({ point: "", code: "", type: "", brand: "", model: "", btu: "", serial: "" });

// ประเภทงาน — value ↔ label (also pre-ticked from a job's job_type via JOBTYPE_TO_WORK)
export const WORK_TYPES = [
  ["install", "ติดตั้ง · Install"],
  ["maintenance", "ล้าง · Cleaning"],
  ["move", "ย้าย · Relocation"],
  ["repair", "ซ่อม · Repair"],
  ["survey_install", "สำรวจงานติดตั้ง · Install survey"],
  ["survey_repair", "สำรวจงานซ่อม · Repair survey"],
  ["other", "อื่น ๆ · Other"],
];

// เครื่องปรับอากาศ — ประเภท (2 ภาษา · ใบเก่าที่เก็บค่าแบบสั้นยังแสดงได้ — editor เติม option ของค่าเดิมให้)
export const AC_TYPES = [
  "ติดผนัง · Wall type",
  "แขวนใต้ฝ้า · Ceiling suspended",
  "ฝังฝ้า 4 ทิศทาง · Cassette",
  "ตู้ตั้งพื้น · Floor standing",
  "ต่อท่อลม · Duct type",
  "หน้าต่าง · Window type",
  "เคลื่อนที่ · Portable",
  "อื่น ๆ · Other",
];
// ยี่ห้อแอร์ที่ขายในไทย — ใช้เป็น datalist (เลือกจากรายการ หรือพิมพ์เองก็ได้ = "อื่นๆ" ในตัว)
export const AC_BRANDS = [
  "Daikin", "Mitsubishi Electric", "Mitsubishi Heavy Duty", "Carrier", "Panasonic", "Toshiba",
  "Hitachi", "Sharp", "Fujitsu General", "LG", "Samsung", "Haier", "Hisense", "Midea", "Gree",
  "TCL", "AUX", "York", "Trane", "Central Air", "Saijo Denki", "Amena", "Eminent", "Star Aire",
  "Uni-Aire", "Tasaki", "Mitsuta", "Beko", "Casper", "Electrolux",
];
// ขนาด BTU มาตรฐาน — ค่าตั้งต้น (จอกรอกจะดึงขนาดจริงจากสินค้าแอร์ในแคตตาล็อกมาแทน ถ้าโหลดได้)
export const BTU_SIZES = ["9000", "12000", "15000", "18000", "24000", "28000", "30000", "32000", "36000", "40000", "45000", "48000", "50000", "60000", "100000"];

// map a job_orders.job_type → the handover work-type value to pre-tick
export const JOBTYPE_TO_WORK = { install: "install", maintenance: "maintenance", repair: "repair", survey: "survey_install", other: "other" };

// ทุกชนิดที่ระบบรู้จัก (รวมชนิดเก่า perf/pm — ใบเก่าที่บันทึกไว้ยังเปิด/พิมพ์ได้ปกติ)
export const FORM_KINDS = [
  { kind: "accept", label: "ส่งมอบงานติดตั้ง · Installation Handover", icon: "🧰", hint: "หลายเครื่องใน 1 ฟอร์ม — เช็คลิสต์ 13 ข้อรายเครื่อง + ความเรียบร้อยรวม + รูปส่งมอบไม่จำกัด" },
  { kind: "clean", label: "ส่งมอบงานล้าง · Cleaning Handover", icon: "🧊", hint: "ต่อเครื่อง — สิ่งที่ทำ 15 ข้อ + วัดก่อน/หลังล้าง 16 รายการ + รูปก่อน/หลัง อย่างละ 4" },
  { kind: "repair", label: "ส่งมอบงานซ่อม · Repair Handover", icon: "🛠️", hint: "ต่อเครื่อง — ตรวจก่อน/หลังซ่อม 13 รายการ + อะไหล่ที่เปลี่ยน + รูปก่อน/หลัง อย่างละ 4" },
  { kind: "perf", label: "วัดประสิทธิภาพ · Performance Test", icon: "🌡️", hint: "ก่อน/หลัง 14 รายการ" },
  { kind: "pm", label: "งานล้าง / PM · Cleaning / PM", icon: "🧊", hint: "เช็คลิสต์ 15 ข้อ" },
];
// 3 แบบหลักที่ให้เลือกตอนกด "เพิ่มแบบฟอร์ม" (แบบเดิมซ่อนจากเมนู แต่ใบเก่ายังเปิดได้)
export const ADD_KINDS = ["accept", "clean", "repair"];

export const blankMachine = () => ({ code: "", type: "", building: "", floor: "", room: "", brand: "", model: "", btu: "", serial: "" });

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
