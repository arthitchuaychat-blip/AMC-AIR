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

// แยกชื่อสินค้าแอร์จากใบเสนอ → {brand, model, btu} แบบ best-effort (จับยี่ห้อจาก AC_BRANDS + BTU จาก regex)
// ชื่อในใบเสนอเป็นข้อความอิสระ ("แอร์ Daikin Inverter 18000 BTU รุ่น FTKM18") ไม่มีคอลัมน์แยก จึงเดาให้เท่าที่ได้ ที่เหลือช่างเติม
export function parseAcMachine(name) {
  const s = String(name || "");
  const btu = (s.match(/(\d[\d,]{2,6})\s*(?:btu|บีทียู)/i) || [])[1]?.replace(/[,\s]/g, "") || "";
  const brand = AC_BRANDS.find((b) => new RegExp(b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(s)) || "";
  const model = (s.match(/(?:รุ่น|model)\s*[:：]?\s*([A-Za-z0-9][A-Za-z0-9/\-]{2,})/i) || [])[1] || "";
  return { brand, model, btu };
}

// map a job_orders.job_type → the handover work-type value to pre-tick
// (job_type ใหม่: ac_sale=ขายเครื่องอย่างเดียว→other · move→move · fix=แก้ไขงาน→repair · remove=รื้อถอน→other)
export const JOBTYPE_TO_WORK = { survey: "survey_install", ac_sale: "other", install: "install", install_only: "install", maintenance: "maintenance", move: "move", repair: "repair", fix: "repair", remove: "other", other: "other" };

// ═══════════ แบบฟอร์มชุดใหม่ (ก.ค. 2569) — ตามเอกสาร AMC-AIR 4 ใบของเจ้าของ ═══════════
// เช็คลิสต์เก็บเป็น section: [ชื่อหมวด, [[รายการ, เกณฑ์/มาตรฐาน], ...]] · ติ๊ก ผ่าน Pass / ไม่ผ่าน Fail
// ตารางวัดค่า: [ค่าที่วัด, หน่วย, ค่ามาตรฐาน] · ทุกป้าย 2 ภาษา ไทย · English

export const REFRIGERANTS = ["R32", "R410A", "R22"];

// ── ติดตั้ง (AMC-IN) — ฉบับกระชับ พิมพ์จบใน A4 1 ใบ ──
export const INST_WORKKINDS = ["ติดตั้งใหม่ · New install", "ย้าย/รื้อถอน+ติดตั้ง · Relocate", "เปลี่ยนเครื่องเดิม · Replacement"];
export const INST_SECTIONS = [
  ["การติดตั้งและระบบ · Installation & systems", [
    ["เครื่อง/อุปกรณ์ครบชุด สภาพสมบูรณ์ ก่อนติดตั้ง · Unit & parts complete, undamaged", "สภาพสมบูรณ์ · Complete"],
    ["ยึดคอยล์เย็น–คอยล์ร้อนแน่นหนา ได้ระดับ มีกันสั่น · Both units mounted level, secure, vibration pads", "แน่น ได้ระดับ · Level"],
    ["คอยล์ร้อนระบายความร้อนดี มีระยะบริการ · Outdoor unit ventilated, service clearance", "อากาศถ่ายเทดี · Ventilated"],
    ["ท่อน้ำยาหุ้มฉนวนครบ แฟลร์ขันแน่นตามทอร์ค เก็บงานเรียบร้อย · Pipes insulated, flares torqued, neat", "เรียบร้อย · Neat"],
    ["ท่อน้ำทิ้งลาดเอียง ระบายน้ำได้จริง · Drain sloped, tested with water", "ลาดเอียง ≥ 1%"],
    ["สายไฟถูกพิกัด เบรกเกอร์แยก มีสายดิน ขั้วแน่น · Correct cable, dedicated breaker, grounded, tight", "ตามมาตรฐาน · To standard"],
    ["ทำสุญญากาศ + ทดสอบรั่วทุกจุด ก่อนปล่อยน้ำยา · Vacuum + leak test before releasing refrigerant", "< 500 micron · ไม่รั่ว"],
    ["ปล่อย/เติมน้ำยาตามความยาวท่อ · Release / top-up refrigerant per pipe length", "ตามสเปกรุ่น · Per spec"],
  ]],
  ["ทดสอบและส่งมอบงาน · Test & handover", [
    ["เปิดทดสอบ ≥ 15 นาที ทุกโหมด ไม่มีรั่ว/หยด/เสียงผิดปกติ · Test run ≥ 15 min, no leaks or noise", "ทำงานปกติ · Normal"],
    ["ทดสอบรีโมทครบฟังก์ชัน + ระบายน้ำทิ้ง · Remote all functions + drain test", "ครบ · All OK"],
    ["เก็บกวาดพื้นที่ ขนเศษวัสดุ/กล่องออก · Clean up site, remove debris", "สะอาด · Clean"],
    ["มอบคู่มือ/ใบรับประกัน อธิบายการใช้งาน + แนะนำรอบล้าง · Manual/warranty handed over, cycle advised", "ลูกค้ารับทราบ · Informed"],
  ]],
];
export const INST_MEAS = [
  ["ค่าสุญญากาศ (Vacuum)", "micron", "< 500 micron (≥ 30 นาที · min)"],
  ["ผลทดสอบรั่ว (Leak test)", "", "ไม่มีฟองรั่ว/แรงดันคงที่ · No leak"],
  ["แรงดันน้ำยาด้าน Low (Suction)", "psi", "ตามชนิดน้ำยา · Per refrigerant"],
  ["อุณหภูมิลมออก (ช่องลมเย็น) · Supply air", "°C", "~ 12–16 °C"],
  ["ผลต่างอุณหภูมิ ΔT (ลมเข้า–ออก)", "°C", "≥ 8–12 °C = ปกติ · Normal"],
  ["กระแสไฟ Compressor / แรงดันไฟ · Amp / Volt", "A · V", "ไม่เกินพิกัด · 220–240 V"],
];

// ── ล้าง (AMC-CL) — ฉบับกระชับ พิมพ์จบใน A4 1 ใบ ──
export const WASH_WORKKINDS = ["ล้างปกติ · Standard clean", "ล้างใหญ่ (Overhaul)", "ในสัญญาบำรุงรักษา · Under PM contract"];
export const WASH_SECTIONS = [
  ["ขั้นตอนการล้าง · Cleaning steps", [
    ["กันเปื้อนพื้นที่ + ตัดไฟ + ถ่ายรูปก่อนล้าง · Protect area, power off, photo before", "ปลอดภัย ไม่เลอะ · Safe"],
    ["ล้างแผ่นกรอง + คอยล์เย็น + โบลเวอร์ สะอาด · Wash filters, evaporator coil & blower", "สะอาด ครีบไม่งอ · Clean"],
    ["ล้างถาด/ท่อน้ำทิ้ง ไม่อุดตัน ระบายได้ · Clean drain pan & line, free flow", "น้ำไหลสะดวก · Free flow"],
    ["ฆ่าเชื้อ ลดกลิ่นอับ + เช็ดตัวเครื่อง/บานสวิง · Sanitize, deodorize, wipe casing", "ไม่มีกลิ่น · No odor"],
    ["ล้างคอยล์ร้อน ครีบโล่ง ใบพัดสมดุลไม่มีเสียง · Wash condenser, fan balanced & quiet", "ครีบโล่ง · Fins clear"],
    ["ขันแน่นจุดต่อสายไฟ + ตรวจฉนวนท่อ · Tighten terminals, check pipe insulation", "แน่น สมบูรณ์ · Tight"],
    ["ตรวจแรงดันน้ำยา/รอยรั่ว เติมหากพร่อง · Check refrigerant pressure & leaks, top-up", "ตามพิกัด ไม่รั่ว · Per spec"],
  ]],
  ["ทดสอบและส่งมอบงาน · Test & handover", [
    ["ประกอบกลับครบ เปิดทดสอบ ≥ 15 นาที · Reassemble, test run ≥ 15 min", "ทำงานปกติ · Normal"],
    ["ไม่มีน้ำหยด เสียง/แรงลมปกติ · No dripping, normal noise & airflow", "ปกติ · Normal"],
    ["เก็บพื้นที่สะอาด + ส่งรูปก่อน–หลังให้ลูกค้า · Clean up, send before/after photos", "ลูกค้ารับทราบ · Informed"],
    ["แนะนำรอบล้างถัดไป / เสนอสัญญาบำรุงรักษา · Advise next cleaning / offer PM contract", "นัดหมาย · Scheduled"],
  ]],
];
export const WASH_MEAS = [
  ["อุณหภูมิลมออก (ช่องลมเย็น) · Supply air", "°C", "~ 12–16 °C"],
  ["ผลต่างอุณหภูมิ ΔT (ลมเข้า–ออก)", "°C", "≥ 8–12 °C = เย็นดี · Good"],
  ["กระแสไฟ Compressor", "A", "ไม่เกินพิกัด · Within rating"],
  ["แรงดันไฟฟ้า (Voltage)", "V", "220–240 V"],
  ["แรงดันน้ำยาด้าน Low (Suction)", "psi", "ตามชนิดน้ำยา · Per refrigerant"],
];

// ── ซ่อม (AMC-RP) ──
export const FIX_SYMPTOMS = ["ไม่เย็น · No cooling", "เย็นน้อย · Weak cooling", "น้ำหยด · Water dripping", "เสียงดัง · Noisy", "มีกลิ่น · Odor", "ไม่ทำงาน · Dead", "น้ำยารั่ว · Refrigerant leak"];
export const FIX_DIAG = [
  ["ตรวจไฟเข้า/เบรกเกอร์ + แผงคอนโทรล/รีโมท/เซนเซอร์ · Power, breaker, control board, remote, sensors", "ปกติ · OK"],
  ["ตรวจคอมเพรสเซอร์ / คาปาซิเตอร์ / มอเตอร์พัดลม · Compressor, capacitor, fan motors", "ค่าปกติ · In range"],
  ["ตรวจแรงดัน/ปริมาณน้ำยา และหารอยรั่ว · Refrigerant pressure & leak check", "ไม่รั่ว/ครบ · No leak"],
  ["ตรวจน้ำทิ้ง/การอุดตันคอยล์/แผงกรอง/ใบพัดลม · Drain, coil, filter & fan clogging", "ไม่อุดตัน · Clear"],
];
export const FIX_REPAIR = [
  ["ซ่อม/เปลี่ยนอะไหล่ตามตารางด้านล่าง · Repair / replace parts per table below", "เสร็จสมบูรณ์ · Completed"],
  ["เติม/เปลี่ยนน้ำยา + ทำสุญญากาศใหม่หากเปิดระบบ · Top-up refrigerant + re-vacuum if opened", "< 500 micron"],
  ["ทดสอบรอยรั่วหลังซ่อมทุกจุดต่อ · Post-repair leak test at all joints", "ไม่มีรั่ว · No leaks"],
];
export const FIX_MEAS = [
  ["อุณหภูมิลมออก (ช่องลมเย็น) · Supply air", "°C", "~ 12–16 °C"],
  ["ผลต่างอุณหภูมิ ΔT (ลมเข้า–ออก)", "°C", "≥ 8–12 °C = เย็นปกติ · Normal"],
  ["กระแสไฟ Compressor / แรงดันไฟ · Amp / Volt", "A · V", "ไม่เกินพิกัด · 220–240 V"],
  ["แรงดันน้ำยาด้าน Low (Suction)", "psi", "ตามชนิดน้ำยา · Per refrigerant"],
  ["ผลเช็ครั่วหลังซ่อม · Post-repair leak check", "", "ไม่มีรอยรั่ว · No leaks"],
];
export const FIX_RESULTS = [["done", "ซ่อมเสร็จ ใช้งานได้ปกติ · Repaired, working normally"], ["temp", "ซ่อมชั่วคราว (รออะไหล่) · Temporary fix (awaiting parts)"], ["replace", "แนะนำเปลี่ยนเครื่อง · Replacement recommended"]];

// ── PM ตามสัญญา (AMC-PM) ──
export const PMC_FREQS = ["ทุก 3 เดือน · Every 3 months", "ทุก 4 เดือน · Every 4 months", "ทุก 6 เดือน · Every 6 months"];
export const PMC_ACTS = [
  ["ล้างแผ่นกรอง + ตรวจ/ล้างคอยล์ตามรอบสัญญา · Clean filters, check/clean coils per cycle", "สะอาด ไม่อุดตัน · Clean"],
  ["ล้างถาดน้ำทิ้ง ตรวจท่อน้ำทิ้งไม่อุดตัน · Clean drain pan, check drain line", "ระบายดี · Drains well"],
  ["ตรวจ/ขันแน่นจุดต่อสายไฟ ขั้ว Terminal · Check & tighten electrical terminals", "แน่น ไม่ร้อน · Tight, cool"],
  ["ตรวจแรงดัน/ปริมาณน้ำยา และหารอยรั่ว · Check refrigerant pressure & leaks", "ครบ/ไม่รั่ว · No leak"],
  ["ตรวจคอม/พัดลม เสียง/สั่น + ฉนวนท่อ · Compressor/fans, noise/vibration, insulation", "ปกติ สมบูรณ์ · Normal"],
  ["ทดสอบรีโมท/ระบบควบคุม เดินเครื่องทดสอบ · Test remote/controls, run test", "ใช้งานได้ · Working"],
];
export const PMC_REF = "เกณฑ์อ้างอิง · Reference: ลมออก Supply ~12–16 °C · ΔT ≥ 8–12 °C · Amp ไม่เกินพิกัด Within rating · ไฟ 220–240 V";
export const blankPmcMachine = () => ({ point: "", code: "", brand: "", btu: "", out: "", dt: "", amp: "", note: "" });

// ทุกชนิดที่ระบบรู้จัก (รวมชนิดเก่า perf/pm — ใบเก่าที่บันทึกไว้ยังเปิด/พิมพ์ได้ปกติ)
export const FORM_KINDS = [
  // ชุดใหม่ตามเอกสาร AMC-AIR (ก.ค. 2569)
  { kind: "inst", label: "เช็คลิสต์ติดตั้งแอร์ · Installation Checklist", icon: "🧰", hint: "ต่อ 1 ชุด — เช็คลิสต์ 12 ข้อ + ค่าที่วัด 6 รายการ (แวคคั่ม/เช็ครั่ว) + รับประกัน + รูป · พิมพ์จบใน A4 1 ใบ" },
  { kind: "wash", label: "เช็คลิสต์ล้างแอร์ · Cleaning Checklist", icon: "🧊", hint: "ต่อเครื่อง — เช็คลิสต์ 11 ข้อ + วัดก่อน/หลังล้าง 5 ค่า + นัดรอบถัดไป + รูปก่อน/หลัง · พิมพ์จบใน A4 1 ใบ" },
  { kind: "fix", label: "รายงานซ่อมแอร์ · Repair Service Report", icon: "🛠️", hint: "ต่อเครื่อง — อาการ + วินิจฉัย 4 ข้อ + การซ่อม/อะไหล่ + วัดหลังซ่อม 5 ค่า + ผล/รับประกัน + รูป · พิมพ์จบใน A4 1 ใบ" },
  { kind: "pmc", label: "บันทึก PM ตามสัญญา · PM Service Record", icon: "📋", hint: "หลายเครื่องใน 1 ฟอร์ม — ทะเบียนเครื่อง+ค่าวัดรายเครื่อง + บำรุงรักษา 6 ข้อ + สรุปรอบ/นัดถัดไป · พิมพ์จบใน A4 1 ใบ" },
  // ชนิดเดิม — ใบเก่าที่บันทึกไว้ยังเปิด/พิมพ์ได้ปกติ
  { kind: "accept", label: "ส่งมอบงานติดตั้ง · Installation Handover", icon: "🧰", hint: "หลายเครื่องใน 1 ฟอร์ม — เช็คลิสต์ 13 ข้อรายเครื่อง + ความเรียบร้อยรวม + รูปส่งมอบไม่จำกัด" },
  { kind: "clean", label: "ส่งมอบงานล้าง · Cleaning Handover", icon: "🧊", hint: "ต่อเครื่อง — สิ่งที่ทำ 15 ข้อ + วัดก่อน/หลังล้าง 16 รายการ + รูปก่อน/หลัง อย่างละ 4" },
  { kind: "repair", label: "ส่งมอบงานซ่อม · Repair Handover", icon: "🛠️", hint: "ต่อเครื่อง — ตรวจก่อน/หลังซ่อม 13 รายการ + อะไหล่ที่เปลี่ยน + รูปก่อน/หลัง อย่างละ 4" },
  { kind: "perf", label: "วัดประสิทธิภาพ · Performance Test", icon: "🌡️", hint: "ก่อน/หลัง 14 รายการ" },
  { kind: "pm", label: "งานล้าง / PM · Cleaning / PM", icon: "🧊", hint: "เช็คลิสต์ 15 ข้อ" },
];
// 4 แบบหลักที่ให้เลือกตอนกด "เพิ่มแบบฟอร์ม" = เอกสาร AMC-AIR 4 ใบ (แบบเดิมซ่อนจากเมนู แต่ใบเก่ายังเปิดได้)
export const ADD_KINDS = ["inst", "wash", "fix", "pmc"];

export const blankMachine = () => ({ code: "", type: "", building: "", floor: "", room: "", brand: "", model: "", btu: "", serial: "" });

export function blankForm(kind) {
  // ── ชุดใหม่ตามเอกสาร AMC-AIR — checks[หมวด][ข้อ] = 'pass' | 'fail' | null ──
  // ติดตั้ง: extras (S/N คอยล์ร้อน, น้ำยา, ท่อ) + วัดค่าเดี่ยว + รับประกัน
  if (kind === "inst") return { kind: "inst", machine: blankMachine(), work_kind: "", refrigerant: "", serial_out: "", pipe_size: "", pipe_len: "",
    checks: INST_SECTIONS.map(([, rows]) => rows.map(() => null)), meas: INST_MEAS.map(() => ""), warranty_install: "", warranty_comp: "", photos: [], note: "" };
  // ล้าง: วัดก่อน/หลัง + นัดรอบถัดไป
  if (kind === "wash") return { kind: "wash", machine: blankMachine(), work_kind: "", refrigerant: "", age: "",
    checks: WASH_SECTIONS.map(([, rows]) => rows.map(() => null)), meas: WASH_MEAS.map(() => ({ b: "", a: "" })), next_date: "", photosBefore: [], photosAfter: [], note: "" };
  // ซ่อม: อาการ + วินิจฉัย + การซ่อม + อะไหล่ + วัดหลังซ่อม + ผล/รับประกัน/นัดติดตาม
  if (kind === "fix") return { kind: "fix", machine: blankMachine(), refrigerant: "", in_warranty: null,
    symptoms: FIX_SYMPTOMS.map(() => false), symptom_other: "", symptom_detail: "", diag: FIX_DIAG.map(() => null), rootcause: "",
    rep: FIX_REPAIR.map(() => null), parts: [{ name: "", qty: "", price: "" }], meas: FIX_MEAS.map(() => ""),
    result: "", warranty: "", follow: "", advice: "", photosBefore: [], photosAfter: [], note: "" };
  // PM ตามสัญญา: ทะเบียนเครื่อง+ค่าวัดรายเครื่อง · acts = ผ่าน 'pass' / แก้ไข 'fix' / null
  if (kind === "pmc") return { kind: "pmc", contract_no: "", round: "", round_of: "", freq: "", time_in_out: "",
    machines: [blankPmcMachine()], acts: PMC_ACTS.map(() => null), issues: "", summary: "", next_date: "", extra_quote: null, photos: [], note: "" };
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
    forms: [],   // ไม่ใส่ฟอร์มตั้งต้น — editor เด้งตัวเลือกแบบฟอร์มให้เลือกเองก่อน
    tech_sign_url: "", tech_name: "",
    cust_sign_url: "", cust_name: "",
    status: "draft",
  };
}
