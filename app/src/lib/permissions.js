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

export const ROLES = ["admin", "exec", "finance", "hr", "sales", "graphic", "stock", "lead_tech", "tech", "maid"];
export const ROLE_LABEL = {
  admin: "ธุรการ", exec: "ผู้บริหาร", finance: "บัญชี/การเงิน", hr: "ฝ่ายบุคคล (HR)", sales: "ฝ่ายขาย",
  graphic: "กราฟิก", stock: "ธุรการวัสดุ", lead_tech: "หัวหน้าช่าง", tech: "ช่าง", maid: "แม่บ้าน",
};

// master sidebar order + which modules support an "edit" level (vs view-only)
export const MODULES = [
  { id: "dashboard", label: "แดชบอร์ด", editable: false },
  { id: "customers", label: "ลูกค้า", editable: true },
  { id: "followup", label: "ติดตามลูกค้า (ขายซ้ำ)", editable: false },
  { id: "weborders", label: "คำสั่งซื้อจากเว็บ", editable: false },
  { id: "website", label: "จัดการเว็บไซต์ (กราฟิก)", editable: true },
  { id: "chat", label: "แชต LINE (ลูกค้า)", editable: true },
  { id: "teamchat", label: "แชตทีม (ภายใน)", editable: false },
  { id: "tasks", label: "กระดานสั่งงาน", editable: true },
  { id: "attendance", label: "เข้างาน/ลา (ของฉัน)", editable: true },
  { id: "hr", label: "HR (จัดการพนักงาน)", editable: true },
  { id: "boq", label: "BOQ", editable: true },
  { id: "quote", label: "ใบเสนอราคา", editable: true },
  { id: "invoice", label: "ใบแจ้งหนี้", editable: true },
  { id: "billing", label: "ใบวางบิล", editable: true },
  { id: "receipt", label: "ใบเสร็จ/ใบกำกับ", editable: true },
  { id: "receivables", label: "เงินค้างรับ", editable: false },
  { id: "tax", label: "รายงานภาษี VAT/WHT", editable: false },
  { id: "profit", label: "กำไร/งาน", editable: false },
  { id: "cashflow", label: "กระแสเงินสด", editable: true },
  { id: "expenses", label: "เบิกจ่าย", editable: true },
  { id: "myjobs", label: "งานของฉัน (หน้างาน)", editable: true },
  { id: "joborders", label: "ใบงาน", editable: true },
  { id: "handover", label: "ใบส่งมอบงาน", editable: true },
  { id: "schedule", label: "ปฏิทินงาน", editable: true },
  { id: "catalog", label: "คลังสินค้า", editable: true },
  { id: "movements", label: "เบิก/คืน/ซื้อ/ตัดเสีย", editable: true },
  { id: "stockcount", label: "นับสต๊อก", editable: true },
  { id: "jobs", label: "วัสดุที่ใช้/ปิดงาน", editable: true },
  { id: "subcontract", label: "ช่างซัพ (เหมา/จ่าย)", editable: true },
  { id: "suppliers", label: "ผู้ขาย (Suppliers)", editable: true },
  { id: "po", label: "ใบสั่งซื้อ (PO)", editable: true },
  { id: "settings", label: "ตั้งค่า + จัดการผู้ใช้", editable: true },
];

const E = "edit", V = "view", N = "none";

// DEFAULT_PERMS[role][module] — see the matrix shared with the user. ธุรการ is the most powerful.
export const DEFAULT_PERMS = {
  admin:     { dashboard: V, customers: E, followup: V, weborders: V, website: E, chat: E, teamchat: E, tasks: E, attendance: E, hr: E, boq: E, quote: E, invoice: E, receipt: E, billing: E, receivables: V, tax: V, profit: V, cashflow: E, expenses: E, myjobs: N, joborders: E, handover: E, schedule: E, catalog: E, movements: E, stockcount: E, jobs: E, subcontract: E, suppliers: E, po: E, settings: E },
  exec:      { dashboard: V, customers: E, followup: V, weborders: V, website: E, chat: E, teamchat: E, tasks: E, attendance: E, hr: E, boq: E, quote: E, invoice: E, receipt: E, billing: E, receivables: V, tax: V, profit: V, cashflow: E, expenses: E, myjobs: N, joborders: E, handover: E, schedule: E, catalog: V, movements: V, stockcount: E, jobs: V, subcontract: E, suppliers: E, po: V, settings: E },
  finance:   { dashboard: V, customers: E, followup: N, weborders: V, website: N, chat: E, teamchat: E, tasks: E, attendance: E, hr: N, boq: V, quote: V, invoice: E, receipt: E, billing: E, receivables: V, tax: V, profit: V, cashflow: E, expenses: E, myjobs: N, joborders: V, handover: V, schedule: V, catalog: V, movements: N, stockcount: V, jobs: V, subcontract: E, suppliers: E, po: E, settings: N },
  sales:     { dashboard: V, customers: E, followup: V, weborders: V, website: E, chat: E, teamchat: E, tasks: E, attendance: E, hr: N, boq: E, quote: E, invoice: E, receipt: E, billing: E, receivables: V, tax: N, profit: V, cashflow: E, expenses: E, myjobs: N, joborders: E, handover: E, schedule: E, catalog: E, movements: N, jobs: N, subcontract: E, suppliers: N, po: N, settings: N },
  stock:     { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, billing: N, receivables: N, tax: N, profit: N, cashflow: N, expenses: E, myjobs: N, joborders: N, handover: N, schedule: N, catalog: E, movements: E, stockcount: E, jobs: E, subcontract: N, suppliers: E, po: E, settings: N },
  lead_tech: { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, billing: N, receivables: N, tax: N, profit: N, cashflow: N, expenses: E, myjobs: E, joborders: V, handover: E, schedule: V, catalog: V, movements: E, jobs: V, subcontract: N, suppliers: N, po: N, settings: N },
  tech:      { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, billing: N, receivables: N, tax: N, profit: N, cashflow: N, expenses: E, myjobs: E, joborders: V, handover: E, schedule: V, catalog: N, movements: E, jobs: N, subcontract: N, suppliers: N, po: N, settings: N },
  hr:        { dashboard: V, customers: E, followup: V, weborders: V, website: E, chat: E, teamchat: E, tasks: E, attendance: E, hr: E, boq: E, quote: E, invoice: E, receipt: E, billing: E, receivables: V, tax: N, profit: V, cashflow: E, expenses: E, myjobs: N, joborders: E, handover: E, schedule: E, catalog: E, movements: N, jobs: N, subcontract: E, suppliers: N, po: N, settings: N },
  graphic:   { dashboard: N, customers: N, followup: N, weborders: V, website: E, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, billing: N, receivables: N, tax: N, profit: N, cashflow: N, expenses: E, myjobs: N, joborders: N, handover: N, schedule: N, catalog: V, movements: N, jobs: N, subcontract: N, suppliers: N, po: N, settings: N },
  maid:      { dashboard: N, customers: N, followup: N, weborders: N, website: N, chat: N, teamchat: E, tasks: E, attendance: E, hr: N, boq: N, quote: N, invoice: N, receipt: N, billing: N, receivables: N, tax: N, profit: N, cashflow: N, expenses: E, myjobs: N, joborders: N, handover: N, schedule: N, catalog: N, movements: N, jobs: N, subcontract: N, suppliers: N, po: N, settings: N },
};

const RANK = { none: 0, view: 1, edit: 2 };

// live permission table — App.jsx calls setPerms() once the saved override is loaded
let _perms = DEFAULT_PERMS;

// deep-merge a saved override over the defaults so unknown/missing keys fall back safely
export function mergePerms(override) {
  if (!override || typeof override !== "object") return DEFAULT_PERMS;
  const out = {};
  for (const role of ROLES) {
    out[role] = { ...DEFAULT_PERMS[role] };
    const o = override[role];
    if (o && typeof o === "object") {
      for (const m of MODULES) {
        if (o[m.id] === N || o[m.id] === V || o[m.id] === E) out[role][m.id] = o[m.id];
      }
    }
  }
  return out;
}

export function setPerms(p) { _perms = p || DEFAULT_PERMS; }
export function getPerms() { return _perms; }

export function levelOf(role, module) {
  return (_perms[role] && _perms[role][module]) || DEFAULT_PERMS[role]?.[module] || N;
}

// can(role, module, "view"|"edit")
export function can(role, module, need = "view") {
  return RANK[levelOf(role, module)] >= RANK[need];
}

// ordered sidebar module ids the role may see
export function navForRole(role) {
  return MODULES.filter((m) => can(role, m.id, "view")).map((m) => m.id);
}
