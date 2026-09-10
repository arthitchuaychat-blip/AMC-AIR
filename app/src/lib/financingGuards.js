// ค่างวดสินเชื่อ — ด่านกันพลาด "ก่อน" สร้างใบเบิก (แนวคิดจากร่าง trial/financing-payment-guards)
// หลักการ: fail-closed — ถ้าฐานข้อมูลไม่มีสถานะงวด (submitted_seq) หรือค่าไม่สมเหตุผล ให้ "หยุด" ไม่สร้างใบเบิก
// (ดีกว่าเดิมที่ fallback ไปเพิ่ม paid_count → ทำให้ "ตั้งจ่าย" ถูกนับเป็น "จ่ายแล้ว" เงียบ ๆ)
// หมายเหตุ: ยังไม่ใช่การล็อกข้ามเครื่อง และไม่แทนที่การทำรายการแบบ atomic (RPC) — เป็นด่านแรกเท่านั้น
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

// ยืนยัน "จ่ายจริงเสร็จ" ได้เฉพาะงวดถัดไปที่ตั้งเบิกไว้จริง (submitted = paid + 1) — ไม่เดินงวดให้อัตโนมัติ
export function requireSubmittedInstallment(loan) {
  requireFinancingState(loan);
  const paid = Number(loan.paid_count), submitted = Number(loan.submitted_seq);
  if (submitted !== paid + 1) {
    throw new Error("ไม่มีงวดถัดไปที่ตั้งเบิกรอยืนยัน — รีเฟรชและตรวจใบเบิกก่อน ไม่เพิ่มงวดให้อัตโนมัติ");
  }
  return submitted;
}
