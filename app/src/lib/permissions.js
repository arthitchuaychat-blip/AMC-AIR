import { isManagement, roleCeiling } from "./roleCapabilities";
// Central permission engine.
//
// Each (role × module) has a level: "none" | "view" | "edit".
//   none → the module is hidden from the sidebar for that role
//   view → the module is visible but read-only (no create/edit/delete)
//   edit → full access (create/edit/delete)
//
// DEFAULT_PERMS below is the shipped design. Admins/execs can override it in ตั้งค่า → สิทธิ์การใช้งาน;
// the override is stored in app_config (key role_permissions) and merged over these defaults at load,
// so new modules added in code keep working even against an older saved override.
//
// Team-scoping (ช่างเห็นเฉพาะทีมตัวเอง, หัวหน้าช่างเห็นทุกทีม) stays in the components — that is job
// logic, not a togglable permission.

// ลำดับนี้ = ลำดับที่โชว์ในดรอปดาวน์ตำแหน่ง + คอลัมน์ตารางสิทธิ์ (ตามที่เจ้าของกำหนด 2026-07-28)
export const ROLES = ["exec", "admin", "finance", "hr", "sales", "field_sales", "graphic", "stock", "maid", "lead_tech", "tech", "assistant"];
export const ROLE_LABEL = {
  exec: "ผู้บริหาร", admin: "ผู้จัดการ", finance: "บัญชีการเงิน", hr: "บุคคล", sales: "ขาย",
  field_sales: "ขายภาคสนาม",
  graphic: "การตลาดและกราฟิก", stock: "คลังสินค้าวัสดุ", maid: "แม่บ้าน",
  lead_tech: "หัวหน้าช่าง", tech: "ช่าง", assistant: "ผู้ช่วยช่าง",
};

// master sidebar order + which modules support an "edit" level (vs view-only)
// ทะเบียนสิทธิ์ "ครบทุกเมนูจริง" (รวมสิทธิ์ย่อยของเมนูที่ยุบรวม) — ใช้กับตารางสิทธิ์ในตั้งค่า + mergePerms
// การมองเห็น "เมนูรวม" (hub) ในแถบข้าง คำนวณจากสิทธิ์ย่อย (ดู HUB_SUBS/hubVisible) ไม่ใช่สิทธิ์แยกของ hub เอง
// group = ใช้จัดกลุ่มหัวข้อในตารางสิทธิ์ให้อ่านง่าย (ไม่กระทบตรรกะ)
export const MODULES = [
  { id: "dashboard", label: "แดชบอร์ด", editable: false, group: "ภาพรวม" },
  { id: "kpi", label: "สกอร์การ์ดผลงาน (KPI)", editable: false, group: "ภาพรวม" },
  { id: "customers", label: "ลูกค้า", editable: true, group: "ลูกค้าและงานขาย" },
  { id: "pipeline", label: "ท่อขาย (Pipeline)", editable: true, group: "ลูกค้าและงานขาย" },
  { id: "followup", label: "ติดตามลูกค้า (ขายซ้ำ)", editable: false, group: "ลูกค้าและงานขาย" },
  { id: "reviews", label: "รีวิวลูกค้า", editable: true, group: "การตลาดและเว็บไซต์" },
  { id: "promo", label: "คูปอง / โปรโมชั่น", editable: true, group: "การตลาดและเว็บไซต์" },
  { id: "website", label: "จัดการเว็บไซต์ (กราฟิก)", editable: true, group: "การตลาดและเว็บไซต์" },
  { id: "weborders", label: "คำสั่งซื้อจากเว็บ", editable: false, group: "ลูกค้าและงานขาย" },
  { id: "chat", label: "แชตลูกค้า (LINE/FB)", editable: true, group: "ลูกค้าและงานขาย" },
  { id: "email", label: "อีเมล (info@amcair.net)", editable: true, group: "ลูกค้าและงานขาย" },
  { id: "teamchat", label: "แชตทีม (ภายใน)", editable: false, group: "ทีม" },
  { id: "tasks", label: "กระดานสั่งงาน", editable: true, group: "ทีม" },
  { id: "attendance", label: "เข้างาน/ลา (ของฉัน)", editable: true, group: "ทีม" },
  { id: "handbook", label: "คู่มือตำแหน่งงาน", editable: false, group: "ทีม" },
  { id: "hr", label: "HR (จัดการพนักงาน)", editable: true, group: "ทีม" },
  { id: "boq", label: "BOQ (ต้นทุน)", editable: true, group: "เอกสารขาย" },
  { id: "quote", label: "ใบเสนอราคา", editable: true, group: "เอกสารขาย" },
  { id: "invoice", label: "ใบส่งของ/ใบแจ้งหนี้", editable: true, group: "เอกสารขาย" },
  { id: "billing", label: "ใบวางบิล", editable: true, group: "เอกสารขาย" },
  { id: "receipt", label: "ใบเสร็จ/ใบกำกับ", editable: true, group: "เอกสารขาย" },
  { id: "adjnote", label: "ใบเพิ่ม/ลดหนี้", editable: true, group: "เอกสารขาย" },
  { id: "receivables", label: "เงินค้างรับ", editable: false, group: "การเงิน" },
  { id: "payables", label: "ค้างจ่าย", editable: false, group: "การเงิน" },
  { id: "tax", label: "รายงานภาษี VAT/WHT", editable: false, group: "การเงิน" },
  { id: "profit", label: "กำไร/งาน", editable: false, group: "การเงิน" },
  { id: "accounting", label: "บัญชี (Double-entry)", editable: true, group: "การเงิน" },
  { id: "cashflow", label: "กระแสเงินสด", editable: true, group: "การเงิน" },
  { id: "loans", label: "หนี้สิน (สินเชื่อ/ผ่อน)", editable: true, group: "การเงิน" },
  { id: "recurring", label: "รายจ่ายประจำ (subscription)", editable: true, group: "การเงิน" },
  { id: "assets", label: "สินทรัพย์/ครุภัณฑ์", editable: true, group: "การเงิน" },
  { id: "expenses", label: "เบิกจ่าย", editable: true, group: "การเงิน" },
  { id: "myjobs", label: "งานของฉัน (หน้างาน)", editable: true, group: "งานช่าง" },
  { id: "joborders", label: "ใบงาน", editable: true, group: "งานช่าง" },
  { id: "handover", label: "ใบส่งมอบงาน", editable: true, group: "งานช่าง" },
  { id: "schedule", label: "ปฏิทินงาน", editable: true, group: "งานช่าง" },
  { id: "jobs", label: "วัสดุที่ใช้/ปิดงาน", editable: true, group: "งานช่าง" },
  { id: "subcontract", label: "ช่างซัพ (เหมา/จ่าย)", editable: true, group: "งานช่าง" },
  { id: "catalog", label: "คลังสินค้า", editable: true, group: "คลัง & จัดซื้อ" },
  { id: "movements", label: "เบิก/คืน/ซื้อ/ตัดเสีย", editable: true, group: "คลัง & จัดซื้อ" },
  { id: "stockcount", label: "นับสต๊อก", editable: true, group: "คลัง & จัดซื้อ" },
  { id: "suppliers", label: "ผู้ขาย (Suppliers)", editable: true, group: "คลัง & จัดซื้อ" },
  { id: "prep", label: "เตรียมวัสดุ (ก่อนสั่งซื้อ/เบิก)", editable: true, group: "คลัง & จัดซื้อ" },
  { id: "po", label: "ใบสั่งซื้อ (PO)", editable: true, group: "คลัง & จัดซื้อ" },
  { id: "tools", label: "เครื่องมือช่าง", editable: true, group: "คลัง & จัดซื้อ" },
  { id: "settings", label: "ตั้งค่า + จัดการผู้ใช้", editable: true, group: "ระบบ" },
];

// เมนูรวม (hub) ในแถบข้าง → สิทธิ์ย่อยที่ประกอบกัน · โชว์ hub ถ้ามีสิทธิ์ดูอย่างน้อย 1 แท็บ
export const HUB_SUBS = {
  marketing: ["promo", "reviews", "website"],
  saleshub: ["customers", "pipeline", "followup"],
  paycenter: ["expenses", "payables", "loans", "recurring"],
  recvcenter: ["receivables", "billing", "receipt"],
  quote: ["quote", "boq"],                          // host = view "quote"
  joborders: ["joborders", "schedule", "jobs", "handover"],  // host = view "joborders"
  po: ["po", "prep"],                               // host = view "po"
};
export function hubVisible(role, hubId) {
  const subs = HUB_SUBS[hubId];
  return subs ? subs.some((s) => can(role, s, "view")) : can(role, hubId, "view");
}

const E = "edit", V = "view", N = "none";

// DEFAULT_PERMS[role][module] — see the matrix shared with the user. ธุรการ is the most powerful.
export const DEFAULT_PERMS = {
  // ผู้จัดการ = อำนาจเต็มเทียบผู้บริหาร (ดูแล-บริหารทุกด้าน) — E ครบทุกโมดูล + ลบถาวรได้
  admin:     { marketing: E, promo: E, accounting: E, dashboard: V, kpi: V, saleshub: E, customers: E, pipeline: E, reviews: E, followup: V, weborders: E, website: E, chat: E, email: E, teamchat: E, tasks: E, attendance: E, hr: E, boq: E, quote: E, invoice: E, recvcenter: E, receipt: E, adjnote: E, billing: E, receivables: V, payables: V, tax: V, profit: V, cashflow: E, loans: E, recurring: E, assets: E, expenses: E, paycenter: E, myjobs: N, joborders: E, handover: E, schedule: E, catalog: E, movements: E, stockcount: E, jobs: E, subcontract: E, suppliers: E, prep: E, po: E, tools: E, handbook: V, settings: E },
  exec:      { marketing: E, promo: E, accounting: E, dashboard: V, kpi: V, saleshub: E, customers: E, pipeline: E, reviews: E, followup: V, weborders: V, website: E, chat: E, email: E, teamchat: E, tasks: E, attendance: E, hr: E, boq: E, quote: E, invoice: E, recvcenter: E, receipt: E, adjnote: E, billing: E, receivables: V, payables: V, tax: V, profit: V, cashflow: E, loans: E, recurring: E, assets: E, expenses: E, paycenter: E, myjobs: N, joborders: E, handover: E, schedule: E, catalog: V, movements: V, stockcount: E, jobs: V, subcontract: E, suppliers: E, prep: E, po: E, tools: E, handbook: V, settings: E },
  finance:   { accounting: E, dashboard: V, kpi: V, saleshub: E, customers: E, pipeline: V, followup: N, weborders: V, website: N, chat: E, email: E, teamchat: E, tasks: E, attendance: E, hr: N, boq: V, quote: V, invoice: E, recvcenter: E, receipt: E, adjnote: E, billing: E, receivables: V, payables: V, tax: V, profit: V, cashflow: E, loans: E, recurring: E, assets: E, expenses: E, paycenter: E, myjobs: N, joborders: V, handover: V, schedule: V, catalog: V, movements: V, stockcount: V, jobs: V, subcontract: E, suppliers: E, prep: E, po: E, tools: V, handbook: V, settings: N }, // เจ้าของเคาะ 2026-07-17: บัญชีดู ขาย/การเงิน/จัดซื้อ/จ่าย ได้ครบ (เปิด movements เป็น V)
  // เจ้าของเคาะ 2026-07-24: ฝ่ายขายเป็นคนสั่งแอร์ พอของมาถึงต้องกดรับเข้าสต๊อกเองได้ → เปิด movements เป็น E
  // (ปุ่ม "รับสินค้าเข้าสต๊อก" บนใบสั่งซื้อพาไปหน้า movements — ปิดไว้ = กดแล้วไปต่อไม่ได้)
  // ⚠️ ต้องคู่กับ RLS mig 174 (transactions insert/select ต้องมี 'sales') ไม่งั้นปุ่มขึ้นแต่ของไม่เข้าสต๊อก
  sales:     { marketing: E, promo: E, dashboard: V, saleshub: E, customers: E, pipeline: E, reviews: E, followup: V, weborders: V, website: E, chat: E, email: E, teamchat: E, tasks: E, attendance: E, hr: N, boq: E, quote: E, invoice: E, recvcenter: E, receipt: E, adjnote: E, billing: E, receivables: V, payables: N, tax: N, profit: V, cashflow: E, expenses: E, paycenter: E, myjobs: N, joborders: E, handover: E, schedule: E, catalog: E, movements: E, jobs: N, subcontract: E, suppliers: N, prep: E, po: E, tools: V, handbook: V, settings: N },
  // ขายภาคสนาม = เหมือน "ขาย" ทุกอย่าง (สำเนาสิทธิ์ตรง ๆ) · RLS ครอบด้วย my_role()→'sales' ใน mig 210
  field_sales: { marketing: E, promo: E, dashboard: V, saleshub: E, customers: E, pipeline: E, reviews: E, followup: V, weborders: V, website: E, chat: E, email: E, teamchat: E, tasks: E, attendance: E, hr: N, boq: E, quote: E, invoice: E, recvcenter: E, receipt: E, adjnote: E, billing: E, receivables: V, payables: N, tax: N, profit: V, cashflow: E, expenses: E, paycenter: E, myjobs: N, joborders: E, handover: E, schedule: E, catalog: E, movements: E, jobs: N, subcontract: E, suppliers: N, prep: E, po: E, tools: V, handbook: V, settings: N },
  stock:     { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, adjnote: N, billing: N, receivables: N, payables: N, tax: N, profit: N, cashflow: N, expenses: E, paycenter: E, myjobs: N, joborders: E, handover: E, schedule: V, catalog: E, movements: E, stockcount: E, jobs: E, subcontract: N, suppliers: E, prep: E, po: E, tools: E, handbook: V, settings: N },
  lead_tech: { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, adjnote: N, billing: N, receivables: N, payables: N, tax: N, profit: N, cashflow: N, expenses: E, paycenter: E, myjobs: E, joborders: V, handover: E, schedule: V, catalog: V, movements: E, jobs: V, subcontract: N, suppliers: N, prep: N, po: N, tools: V, handbook: V, settings: N },
  tech:      { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, adjnote: N, billing: N, receivables: N, payables: N, tax: N, profit: N, cashflow: N, expenses: E, paycenter: E, myjobs: E, joborders: V, handover: E, schedule: V, catalog: N, movements: E, jobs: N, subcontract: N, suppliers: N, prep: N, po: N, tools: V, handbook: V, settings: N },
  assistant: { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, adjnote: N, billing: N, receivables: N, payables: N, tax: N, profit: N, cashflow: N, expenses: E, paycenter: E, myjobs: E, joborders: V, handover: E, schedule: V, catalog: N, movements: E, jobs: N, subcontract: N, suppliers: N, prep: N, po: N, tools: V, handbook: V, settings: N },  // ผู้ช่วยช่าง = เหมือนช่างทุกอย่าง
  hr:        { teamchat: E, tasks: E, attendance: E, handbook: V, hr: E, expenses: E, paycenter: E },
  graphic:   { marketing: E, dashboard: N, customers: N, followup: N, reviews: E, weborders: V, website: E, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, adjnote: N, billing: N, receivables: N, payables: N, tax: N, profit: N, cashflow: N, expenses: E, paycenter: E, myjobs: N, joborders: N, handover: N, schedule: N, catalog: V, movements: N, jobs: N, subcontract: N, suppliers: N, prep: N, po: N, tools: N, handbook: V, settings: N },
  maid:      { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, adjnote: N, billing: N, receivables: N, payables: N, tax: N, profit: N, cashflow: N, expenses: E, paycenter: E, myjobs: N, joborders: N, handover: N, schedule: N, catalog: N, movements: N, jobs: N, subcontract: N, suppliers: N, prep: N, po: N, tools: N, handbook: V, settings: N },
};

// September 2026 owner-approved policy. Self-service is separate from HR admin.
for (const role of ["exec", "admin"]) {
  for (const module of MODULES) DEFAULT_PERMS[role][module.id] = E;
}

const RANK = { none: 0, view: 1, edit: 2 };

// live permission table — App.jsx calls setPerms() once the saved override is loaded
let _perms = DEFAULT_PERMS;

// deep-merge a saved override over the defaults so unknown/missing keys fall back safely
// ⚠️ ต้อง merge "ทุกคีย์สิทธิ์ที่มีจริง" (Object.keys ของ DEFAULT_PERMS) ไม่ใช่แค่ MODULES ที่โชว์ในแถบข้าง —
//    เมนูที่ยุบรวมแล้ว (expenses/boq/loans ฯลฯ) ยังคุมสิทธิ์รายแท็บด้วย can() อยู่ · ถ้าเมิน override ที่เจ้าของ
//    ตั้งไว้ พนักงานที่เคยถูกปิดสิทธิ์งานย่อยจะกลับมาใช้ได้ตาม default (ช่องโหว่สิทธิ์)
export function mergePerms(override) {
  if (!override || typeof override !== "object") return DEFAULT_PERMS;
  const out = {};
  for (const role of ROLES) {
    out[role] = { ...DEFAULT_PERMS[role] };
    const o = override[role];
    if (o && typeof o === "object") {
      for (const key of Object.keys(o)) {   // ทุกคีย์ที่เจ้าของตั้งไว้ (รวมสิทธิ์ที่ "เพิ่ม" ให้เมนูที่ default ไม่มี)
        if (o[key] === N || o[key] === V || o[key] === E) out[role][key] = o[key];
      }
    }
  }
  return out;
}

export function setPerms(p) { _perms = mergePerms(p); }
export function getPerms() { return _perms; }

export function levelOf(role, module) {
  const cap = roleCeiling(role, module);
  if (cap === N) return N;
  if (isManagement(role)) return E;
  // Each employee keeps their own attendance, leave, advances and salary screen.
  if (ROLES.includes(role) && module === "attendance") return E;
  const configured = (_perms[role] && _perms[role][module]) || DEFAULT_PERMS[role]?.[module] || N;
  return RANK[configured] > RANK[cap] ? cap : configured;
}

// can(role, module, "view"|"edit")
export function can(role, module, need = "view") {
  return RANK[levelOf(role, module)] >= RANK[need];
}

// ordered sidebar module ids the role may see
export function navForRole(role) {
  return MODULES.filter((m) => can(role, m.id, "view")).map((m) => m.id);
}
