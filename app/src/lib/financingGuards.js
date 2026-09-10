// Fail closed before creating an expense on a database missing installment state.
// This does not provide cross-client locking or replace an atomic payment RPC.
export function requireFinancingState(loan) {
  if (!loan || !Object.hasOwn(loan, "submitted_seq") || loan.submitted_seq == null) {
    throw new Error("ระบบสถานะค่างวดยังไม่พร้อม — ให้ผู้ดูแลตรวจโครงสร้างฐานข้อมูลก่อนตั้งเบิก ยังไม่ได้สร้างใบเบิกจากคำขอนี้");
  }
  for (const field of ["paid_count", "submitted_seq", "term_months"]) {
    if (loan[field] == null || loan[field] === "" || !Number.isSafeInteger(Number(loan[field])) || Number(loan[field]) < 0) {
      throw new Error("ข้อมูลจำนวนงวดไม่ถูกต้อง — ให้ผู้ดูแลตรวจสัญญาก่อนดำเนินการ");
    }
  }
  if (Number(loan.paid_count) > Number(loan.term_months) || Number(loan.submitted_seq) > Number(loan.term_months)) {
    throw new Error("จำนวนงวดเกินอายุสัญญา — ให้ผู้ดูแลตรวจสัญญาก่อนดำเนินการ");
  }
}

export function requireSubmittedInstallment(loan) {
  requireFinancingState(loan);
  const paid = Number(loan.paid_count), submitted = Number(loan.submitted_seq);
  if (submitted !== paid + 1) {
    throw new Error("ไม่มีงวดถัดไปที่ตั้งเบิกรอยืนยัน — รีเฟรชและตรวจใบเบิกก่อน ไม่เพิ่มงวดให้อัตโนมัติ");
  }
  return submitted;
}
