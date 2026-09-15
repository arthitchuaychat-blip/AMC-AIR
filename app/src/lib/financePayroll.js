import { supabase } from "./supabase";
import { frozenPayslip, ALLOWANCE_KINDS } from "./payroll";

export const PAYROLL_INCOME = [
  ["base", "เงินเดือน/ค่าแรงในรอบ"], ["otPay", "ค่าล่วงเวลา OT"],
  ["holPay", "ค่าทำงานวันหยุด"], ["bonus", "โบนัส/เบี้ยเลี้ยง"],
  ...ALLOWANCE_KINDS.map((x) => ["allow." + x.k, x.label]),
];
export const PAYROLL_DEDUCTIONS = [
  ["dLate", "หักมาสาย"], ["dAbsent", "หักขาดงาน"], ["dLeave", "หักลาเกินสิทธิ์/ลาไม่รับค่าแรง"],
  ["dSso", "ประกันสังคม"], ["dTax", "ภาษีหัก ณ ที่จ่าย"], ["dAdvance", "เบิกล่วงหน้า"],
  ["dLoan", "เงินยืม"], ["dWater", "ค่าน้ำ"], ["dElectric", "ค่าไฟ"], ["otherDeduct", "รายการหักอื่น"],
];
export const payrollAmount = (calc, key) => key.startsWith("allow.") ? Number(calc.allow?.[key.slice(6)]) || 0 : Number(calc[key]) || 0;
export const payrollStatus = (slip) => !slip ? "ยังไม่บันทึกรอบ" : slip.status === "paid" ? "อนุมัติส่งเบิกจ่ายแล้ว" : "ร่างที่ HR บันทึก";

export async function loadFinancePayroll(period, client = supabase) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("กรุณาเลือกเดือนให้ถูกต้อง");
  const { data, error } = await client.rpc("finance_payroll_report", { p_period: period });
  if (error) throw error;
  if (!data || data.period !== period || !Array.isArray(data.employees) || !Array.isArray(data.slips)) {
    throw new Error("ข้อมูลเงินเดือนไม่ครบ กรุณาโหลดใหม่");
  }
  return data;
}

// Reports use saved values for drafts and approved rounds. Current rates must
// never recalculate historical payroll; missing slips are not zero salaries.
export function financePayrollRows(data) {
  const slips = new Map(data.slips.map((s) => [s.user_id, s]));
  const staff = new Map(data.employees.map((p) => [p.id, p]));
  for (const s of data.slips) if (!staff.has(s.user_id)) {
    staff.set(s.user_id, { id: s.user_id, name: "พนักงานเดิม (ไม่พบชื่อในทะเบียน)", active: false, has_pay_rate: false });
  }
  return [...staff.values()].map((employee) => {
    const slip = slips.get(employee.id) || null;
    const calc = slip ? frozenPayslip(slip) : null;
    return { employee, slip, calc, mismatch: !!calc && Math.abs(calc.gross - calc.ded - calc.net) > 0.51 };
  });
}

export function payrollTotals(rows) {
  return rows.reduce((sum, row) => {
    if (row.calc) { sum.count++; for (const k of ["gross", "ded", "net"]) sum[k] += row.calc[k]; }
    return sum;
  }, { count: 0, gross: 0, ded: 0, net: 0 });
}

export function financePayrollCsv(period, rows) {
  const cell = (v) => {
    const text = typeof v === "string" && /^[\s]*[=+@-]/.test(v) ? "'" + v : String(v ?? "");
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const money = (row, key) => row.calc ? payrollAmount(row.calc, key) : "";
  const fields = [...PAYROLL_INCOME, ...PAYROLL_DEDUCTIONS];
  const table = [["รอบเดือน", "พนักงาน", "สถานะ", "ฐานค่าจ้างปัจจุบัน", "ประเภทฐานค่าจ้าง", ...fields.map(([, label]) => label), "รวมรายได้", "รวมรายการหัก", "สุทธิที่บันทึก"],
    ...rows.map((r) => [period, r.employee.name, payrollStatus(r.slip), r.employee.has_pay_rate ? r.employee.base_pay : "",
      r.employee.has_pay_rate ? (r.employee.pay_type === "daily" ? "บาท/วัน" : "บาท/เดือน") : "",
      ...fields.map(([k]) => money(r, k)), money(r, "gross"), money(r, "ded"), money(r, "net")])];
  return "\uFEFF" + table.map((row) => row.map(cell).join(",")).join("\r\n");
}
