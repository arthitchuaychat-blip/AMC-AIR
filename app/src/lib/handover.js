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

// ═══════════ แบบฟอร์มชุดใหม่ (ก.ค. 2569) — ตามเอกสาร AMC-AIR 4 ใบของเจ้าของ ═══════════
// เช็คลิสต์เก็บเป็น section: [ชื่อหมวด, [[รายการ, เกณฑ์/มาตรฐาน], ...]] · ติ๊ก ผ่าน Pass / ไม่ผ่าน Fail
// ตารางวัดค่า: [ค่าที่วัด, หน่วย, ค่ามาตรฐาน] · ทุกป้าย 2 ภาษา ไทย · English

export const REFRIGERANTS = ["R32", "R410A", "R22"];

// ── ติดตั้ง (AMC-IN) ──
export const INST_WORKKINDS = ["ติดตั้งใหม่ · New install", "ย้าย/รื้อถอน+ติดตั้ง · Relocate", "เปลี่ยนเครื่องเดิม · Replacement"];
export const INST_SECTIONS = [
  ["ก่อนติดตั้ง (สำรวจและเตรียมงาน) · Before installation", [
    ["ตรวจสภาพเครื่อง/อุปกรณ์ก่อนแกะกล่อง ไม่บุบ/แตกร้าว ครบชุด · Inspect unit before unboxing, complete & undamaged", "สภาพสมบูรณ์ · Complete"],
    ["เลือกจุดติดตั้งเหมาะสม ระบายลม/ความร้อนดี เว้นระยะบริการ · Proper location, good airflow, service clearance", "ตามคู่มือรุ่น · Per manual"],
    ["ตรวจโครงสร้างผนัง/จุดยึด รับน้ำหนักได้ · Wall/mounting structure supports the load", "แข็งแรง · Solid"],
    ["วางแผนแนวเดินท่อ/ท่อน้ำทิ้ง/สายไฟ สั้น เรียบร้อย · Plan pipe/drain/cable routing, short & neat", "ระยะเหมาะสม · Optimal run"],
    ["ปูผ้าใบ/กันเปื้อน คุ้มครองพื้นที่หน้างานลูกค้า · Protect customer's area with drop cloths", "ไม่เลอะ · No mess"],
  ]],
  ["การติดตั้งชุดคอยล์เย็น–คอยล์ร้อน · Indoor & outdoor unit installation", [
    ["ยึดแผ่นหลัง (Bracket) คอยล์เย็น ได้ระดับน้ำ แน่นหนา · Indoor bracket level & secure", "ได้ระดับ ไม่เอียง · Level"],
    ["ขาแขวน/ฐานคอยล์ร้อนมั่นคง มีแท่นยาง/สปริงกันสั่น · Outdoor mount solid with vibration pads", "ไม่สั่นสะเทือน · No vibration"],
    ["คอยล์ร้อนอยู่ที่ระบายความร้อนดี ไม่อับ ไม่โดนแดด/ฝนตรง · Outdoor unit well ventilated, sheltered", "อากาศถ่ายเทดี · Good airflow"],
    ["เดินท่อน้ำยาหุ้มฉนวนครบ ดัดท่อไม่หักพับ ไม่แบน · Pipes insulated, bent without kinks", "ท่อไม่ตีบ · No kinks"],
    ["บานแฟลร์ (Flare) เรียบร้อย ขันแน่นตามค่าทอร์ค · Flares clean, torqued to spec", "ตามพิกัดทอร์ค · Torque spec"],
    ["ท่อน้ำทิ้งมีความลาดเอียง ระบายได้ ไม่ย้อนกลับ · Drain sloped, drains freely", "ลาดเอียง ≥ 1% · Slope ≥ 1%"],
    ["เก็บงานท่อ/รางครอบเรียบร้อย สวยงาม (ถ้ามี) · Trunking neatly finished", "เรียบร้อย · Neat"],
  ]],
  ["ระบบไฟฟ้า · สุญญากาศ · น้ำยา · Electrical · Vacuum · Refrigerant", [
    ["สายไฟขนาดถูกต้องตามพิกัด มีเบรกเกอร์แยกวงจร · Correct cable size, dedicated breaker", "ตามพิกัดกระแส · Rated"],
    ["ต่อสายดิน (Ground) ครบถ้วนตามมาตรฐาน · Grounding complete to standard", "มีสายดิน · Grounded"],
    ["ขั้วสายไฟคอยล์เย็น–ร้อนถูกตำแหน่ง ขันแน่น · Terminals correct & tight", "แน่น ไม่หลุด · Tight"],
    ["ทำสุญญากาศ (Vacuum) ไล่อากาศ/ความชื้นตามเวลา · Vacuum system to remove air/moisture", "บังคับทุกงาน · Mandatory"],
    ["ทดสอบรั่ว (Leak test) ทุกจุดต่อก่อนเปิดน้ำยา · Leak test all joints before releasing refrigerant", "ไม่มีรั่ว · No leaks"],
    ["เปิดวาล์วปล่อยน้ำยา / เติมเพิ่มตามความยาวท่อ · Release refrigerant / top-up per pipe length", "ตามสเปกรุ่น · Per spec"],
  ]],
  ["ทดสอบและส่งมอบงาน · Test & handover", [
    ["เปิดทดสอบ ≥ 15–30 นาที ตรวจทุกโหมด · Test run ≥ 15–30 min, all modes", "ทำงานปกติ · Normal"],
    ["ไม่มีน้ำยารั่ว/น้ำหยด/เสียงผิดปกติขณะทำงาน · No leaks, dripping or abnormal noise", "ปกติทุกจุด · All normal"],
    ["ทดสอบระบายน้ำทิ้ง เทน้ำ ไหลออกจริง · Drain test with water, drains out", "ระบายดี · Drains well"],
    ["ทดสอบรีโมท/ฟังก์ชัน ตั้งอุณหภูมิ สวิง ทุกปุ่ม · Remote & all functions work", "ครบทุกฟังก์ชัน · All OK"],
    ["เก็บกวาดพื้นที่ ขนเศษวัสดุ/กล่องออก · Clean up site, remove debris & boxes", "สะอาด · Clean"],
    ["มอบคู่มือ/ใบรับประกัน + อธิบายการใช้งาน · Hand over manual/warranty, explain usage", "ลูกค้ารับทราบ · Informed"],
    ["แนะนำรอบล้าง (ทุก 4–6 เดือน) / เสนอสัญญาดูแล · Advise cleaning cycle / offer PM contract", "นัดหมาย · Scheduled"],
  ]],
];
export const INST_MEAS = [
  ["ค่าสุญญากาศ (Vacuum)", "micron", "< 500 micron (≥ 30 นาที · min)"],
  ["ผลทดสอบรั่ว (Leak test)", "", "ไม่มีฟองรั่ว/แรงดันคงที่ · No leak, holds"],
  ["แรงดันน้ำยาด้าน Low (Suction)", "psi", "ตามชนิดน้ำยา · Per refrigerant"],
  ["แรงดันน้ำยาด้าน High (Discharge)", "psi", "ตามพิกัดรุ่น · Per model"],
  ["อุณหภูมิลมออก (ช่องลมเย็น) · Supply air", "°C", "~ 12–16 °C"],
  ["ผลต่างอุณหภูมิ ΔT (ลมเข้า–ออก)", "°C", "≥ 8–12 °C = ปกติ · Normal"],
  ["กระแสไฟ Compressor (Running)", "A", "ไม่เกินพิกัดข้างเครื่อง · Within rating"],
  ["แรงดันไฟฟ้า (Voltage)", "V", "220–240 V (1 เฟส · phase)"],
  ["ปริมาณน้ำยาที่เติมเพิ่ม (ถ้ามี) · Top-up", "g", "ตามความยาวท่อส่วนเกิน · Per extra pipe"],
];

// ── ล้าง (AMC-CL) ──
export const WASH_WORKKINDS = ["ล้างปกติ · Standard clean", "ล้างใหญ่ (Overhaul)", "ในสัญญาบำรุงรักษา · Under PM contract"];
export const WASH_SECTIONS = [
  ["ก่อนเริ่มงาน (เตรียมงาน) · Preparation", [
    ["แจ้งลูกค้า/ตรวจอาการเบื้องต้น ทดสอบเปิดก่อนล้าง · Check & test-run before cleaning", "บันทึกอาการ · Recorded"],
    ["ปูผ้าใบ/พลาสติกกันเปื้อน คลุมพื้น เฟอร์นิเจอร์ ผนัง · Cover floor, furniture & walls", "ไม่มีคราบน้ำ · No stains"],
    ["ตัดเบรกเกอร์/ปิดไฟก่อนถอดชิ้นส่วน · Power off at breaker before disassembly", "เพื่อความปลอดภัย · Safety"],
    ["ถ่ายรูปสภาพก่อนล้าง (ก่อน–หลัง ส่งลูกค้า) · Photo before cleaning", "เก็บหลักฐาน · Documented"],
  ]],
  ["ขั้นตอนการล้าง — ชุดคอยล์เย็น (Indoor unit)", [
    ["ถอดและล้างแผ่นกรองอากาศ (Filter) ให้สะอาด · Remove & wash filters", "ไม่มีฝุ่นอุดตัน · No clogging"],
    ["ล้างคอยล์เย็น (Evaporator) ด้วยน้ำแรงดัน/โฟม · Wash evaporator coil", "ครีบไม่พับงอ · Fins intact"],
    ["ล้างใบพัดลมกรงกระรอก (Blower) ไม่มีเมือก/เชื้อรา · Clean blower wheel", "หมุนคล่อง · Spins freely"],
    ["ล้างถาดน้ำทิ้ง/ตรวจท่อน้ำทิ้ง ไม่อุดตัน · Clean drain pan & line", "น้ำไหลสะดวก · Free flow"],
    ["ทำความสะอาด/ฆ่าเชื้อ ลดกลิ่นอับ (Anti-bacteria) · Sanitize, deodorize", "ไม่มีกลิ่น · No odor"],
    ["เช็ดหน้ากาก บานสวิง ตัวเครื่อง · Wipe casing, louvers & body", "ผิวสะอาด · Clean"],
  ]],
  ["ชุดคอยล์ร้อน (Outdoor) และระบบไฟ/น้ำยา · Outdoor unit & electrical/refrigerant", [
    ["ล้างคอยล์ร้อน (Condenser) ฝุ่น/ใบไม้ ครีบระบาย · Wash condenser coil", "ครีบโล่ง · Fins clear"],
    ["ตรวจใบพัดลมคอยล์ร้อน หมุนสมดุล ไม่มีเสียงผิดปกติ · Check outdoor fan, balanced & quiet", "ไม่สั่น/ไม่ดัง · Smooth"],
    ["ตรวจ/ขันแน่นจุดต่อสายไฟ ขั้ว Terminal · Check & tighten terminals", "แน่น ไม่ร้อน · Tight, cool"],
    ["ตรวจฉนวนหุ้มท่อน้ำยา ไม่ฉีกขาด ไม่มีน้ำหยด · Check pipe insulation, no condensate", "ฉนวนสมบูรณ์ · Intact"],
    ["ตรวจแรงดันน้ำยา / เติมหากพร่อง (ระบุปริมาณ) · Check pressure / top-up if low", "ตามพิกัดรุ่น · Per spec"],
    ["ตรวจรอยรั่วจุดต่อ (Flare) และวาล์วบริการ · Leak-check flares & service valves", "ไม่มีรอยรั่ว · No leaks"],
  ]],
  ["ทดสอบและส่งมอบงาน · Test & handover", [
    ["ประกอบชิ้นส่วนกลับครบ ยึดแน่น ไม่มีเหลือ · Reassemble completely", "ครบ/แน่น · Complete"],
    ["เปิดทดสอบ ≥ 15 นาที ตรวจการทำงานรวม · Test run ≥ 15 min", "ทำงานปกติ · Normal"],
    ["ตรวจน้ำทิ้ง ไม่รั่วซึม ไม่หยดจากเครื่อง/ท่อ · No leaks or dripping", "ไม่มีน้ำหยด · No drips"],
    ["ตรวจเสียง/แรงลม ไม่มีเสียงผิดปกติ ลมสม่ำเสมอ · Check noise & airflow", "ปกติ · Normal"],
    ["เก็บกวาดพื้นที่ให้สะอาดเหมือนเดิม · Clean up work area", "สะอาด · Clean"],
    ["ส่งรูปก่อน–หลัง + ค่าที่วัดให้ลูกค้า · Send before/after photos & readings", "ลูกค้ารับทราบ · Informed"],
    ["แนะนำรอบล้างถัดไป / เสนอสัญญาบำรุงรักษา · Advise next cleaning / offer PM contract", "นัดหมาย · Scheduled"],
  ]],
];
export const WASH_MEAS = [
  ["อุณหภูมิลมออก (ช่องลมเย็น) · Supply air", "°C", "~ 12–16 °C"],
  ["อุณหภูมิลมเข้า (Return air)", "°C", "อุณหภูมิห้อง · Room temp"],
  ["ผลต่างอุณหภูมิ ΔT (ลมเข้า–ออก)", "°C", "≥ 8–12 °C = เย็นดี · Good"],
  ["กระแสไฟ Compressor", "A", "ไม่เกินพิกัดข้างเครื่อง · Within rating"],
  ["แรงดันไฟฟ้า (Voltage)", "V", "220–240 V (1 เฟส · phase)"],
  ["แรงดันน้ำยาด้าน Low (Suction)", "psi", "ตามชนิดน้ำยา · Per refrigerant"],
  ["แรงดันน้ำยาด้าน High (ถ้ามี · if any)", "psi", "ตามพิกัดรุ่น · Per model"],
  ["อุณหภูมิคอยล์ร้อน / ลมระบาย · Condenser air", "°C", "ระบายความร้อนดี · Good rejection"],
];

// ── ซ่อม (AMC-RP) ──
export const FIX_SYMPTOMS = ["ไม่เย็น · No cooling", "เย็นน้อย · Weak cooling", "น้ำหยด · Water dripping", "เสียงดัง · Noisy", "มีกลิ่น · Odor", "ไม่ทำงาน · Dead", "น้ำยารั่ว · Refrigerant leak"];
export const FIX_DIAG = [
  ["ตรวจแหล่งจ่ายไฟ / เบรกเกอร์ / แรงดันไฟเข้า · Power supply, breaker, incoming voltage", "ไฟปกติ · Power OK"],
  ["ตรวจแผงคอนโทรล / เมนบอร์ด / รีโมท / เซนเซอร์ · Control board, remote, sensors", "ทำงานปกติ · Working"],
  ["ตรวจคอมเพรสเซอร์ / คาปาซิเตอร์ / มอเตอร์พัดลม · Compressor, capacitor, fan motors", "ค่าปกติ · In range"],
  ["ตรวจแรงดัน/ปริมาณน้ำยา และหารอยรั่ว (Leak test) · Refrigerant pressure & leak check", "ไม่รั่ว/ครบ · No leak"],
  ["ตรวจท่อน้ำทิ้ง / การอุดตัน / ถาดน้ำทิ้ง · Drain line, clogging, drain pan", "ระบายดี · Drains well"],
  ["ตรวจการอุดตันคอยล์ / แผงกรอง / ใบพัดลม · Coil, filter & fan clogging", "ไม่อุดตัน · Clear"],
];
export const FIX_REPAIR = [
  ["งานที่ดำเนินการซ่อม (ระบุในตารางอะไหล่) · Repair work performed (see parts table)", "เสร็จสมบูรณ์ · Completed"],
  ["เปลี่ยน/เติมน้ำยา (ระบุชนิดและปริมาณ) · Replace/top-up refrigerant (type & amount)", "ตามพิกัด · Per spec"],
  ["ทำสุญญากาศใหม่ หากเปิดระบบน้ำยา · Re-vacuum if refrigerant circuit opened", "< 500 micron"],
  ["ทดสอบรอยรั่วหลังซ่อมทุกจุดต่อ · Post-repair leak test at all joints", "ไม่มีรั่ว · No leaks"],
];
export const FIX_MEAS = [
  ["อุณหภูมิลมออก (ช่องลมเย็น) · Supply air", "°C", "~ 12–16 °C"],
  ["ผลต่างอุณหภูมิ ΔT (ลมเข้า–ออก)", "°C", "≥ 8–12 °C = เย็นปกติ · Normal"],
  ["กระแสไฟ Compressor (Running)", "A", "ไม่เกินพิกัดข้างเครื่อง · Within rating"],
  ["แรงดันไฟฟ้า (Voltage)", "V", "220–240 V (1 เฟส · phase)"],
  ["แรงดันน้ำยาด้าน Low (Suction)", "psi", "ตามชนิดน้ำยา · Per refrigerant"],
  ["แรงดันน้ำยาด้าน High (ถ้ามี · if any)", "psi", "ตามพิกัดรุ่น · Per model"],
  ["ผลเช็ครั่วหลังซ่อม · Post-repair leak check", "", "ไม่มีรอยรั่ว · No leaks"],
];
export const FIX_RESULTS = [["done", "ซ่อมเสร็จ ใช้งานได้ปกติ · Repaired, working normally"], ["temp", "ซ่อมชั่วคราว (รออะไหล่) · Temporary fix (awaiting parts)"], ["replace", "แนะนำเปลี่ยนเครื่อง · Replacement recommended"]];

// ── PM ตามสัญญา (AMC-PM) ──
export const PMC_FREQS = ["ทุก 3 เดือน · Every 3 months", "ทุก 4 เดือน · Every 4 months", "ทุก 6 เดือน · Every 6 months"];
export const PMC_ACTS = [
  ["ล้าง/เป่าทำความสะอาดแผ่นกรองอากาศ · Clean/blow air filters", "ไม่อุดตัน · Clear"],
  ["ตรวจ/ล้างคอยล์เย็น–คอยล์ร้อน ตามรอบสัญญา · Check/clean coils per contract cycle", "ครีบสะอาด · Fins clean"],
  ["ล้างถาดน้ำทิ้ง ตรวจท่อน้ำทิ้งไม่อุดตัน · Clean drain pan, check drain line", "ระบายดี · Drains well"],
  ["ตรวจ/ขันแน่นจุดต่อสายไฟ ขั้ว Terminal · Check & tighten electrical terminals", "แน่น ไม่ร้อน · Tight, cool"],
  ["ตรวจแรงดัน/ปริมาณน้ำยา และหารอยรั่ว · Check refrigerant pressure & leaks", "ครบ/ไม่รั่ว · Full, no leak"],
  ["ตรวจคอมเพรสเซอร์/พัดลม เสียง/การสั่น · Check compressor/fans, noise & vibration", "ปกติ · Normal"],
  ["ตรวจฉนวนท่อน้ำยา ไม่ฉีกขาด ไม่มีน้ำหยด · Check pipe insulation, no condensate", "สมบูรณ์ · Intact"],
  ["ทดสอบรีโมท/ระบบควบคุม เดินเครื่องทดสอบ · Test remote/controls, run test", "ใช้งานได้ · Working"],
];
export const PMC_REF = "เกณฑ์อ้างอิง · Reference: ลมออก Supply ~12–16 °C · ΔT ≥ 8–12 °C · Amp ไม่เกินพิกัด Within rating · ไฟ 220–240 V";
export const blankPmcMachine = () => ({ point: "", code: "", brand: "", btu: "", out: "", dt: "", amp: "", note: "" });

// ทุกชนิดที่ระบบรู้จัก (รวมชนิดเก่า perf/pm — ใบเก่าที่บันทึกไว้ยังเปิด/พิมพ์ได้ปกติ)
export const FORM_KINDS = [
  // ชุดใหม่ตามเอกสาร AMC-AIR (ก.ค. 2569)
  { kind: "inst", label: "เช็คลิสต์ติดตั้งแอร์ · Installation Checklist", icon: "🧰", hint: "ต่อ 1 ชุด — เช็คลิสต์ 4 หมวด 25 ข้อ + ค่าที่วัด 9 รายการ (แวคคั่ม/เช็ครั่ว) + รับประกัน + รูป" },
  { kind: "wash", label: "เช็คลิสต์ล้างแอร์ · Cleaning Checklist", icon: "🧊", hint: "ต่อเครื่อง — เช็คลิสต์ 4 หมวด 23 ข้อ + วัดก่อน/หลังล้าง 8 ค่า + นัดรอบถัดไป + รูปก่อน/หลัง" },
  { kind: "fix", label: "รายงานซ่อมแอร์ · Repair Service Report", icon: "🛠️", hint: "ต่อเครื่อง — อาการ + วินิจฉัย 6 ข้อ + การซ่อม/อะไหล่ + วัดหลังซ่อม 7 ค่า + ผล/รับประกัน + รูป" },
  { kind: "pmc", label: "บันทึก PM ตามสัญญา · PM Service Record", icon: "📋", hint: "หลายเครื่องใน 1 ฟอร์ม — ทะเบียนเครื่อง+ค่าวัดรายเครื่อง + บำรุงรักษา 8 ข้อ + สรุปรอบ/นัดถัดไป" },
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
  // แบบฟอร์มตั้งต้นตามประเภทงานของใบงาน (แก้/เพิ่มเองได้)
  const kind0 = jo?.job_type === "install" ? "inst" : jo?.job_type === "maintenance" ? "wash" : jo?.job_type === "repair" ? "fix" : "wash";
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
    forms: [blankForm(kind0)],
    tech_sign_url: "", tech_name: "",
    cust_sign_url: "", cust_name: "",
    status: "draft",
  };
}
