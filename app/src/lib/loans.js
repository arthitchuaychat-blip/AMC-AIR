// การผ่อนชำระ (สินเชื่อ/เช่าซื้อ) — คำนวณตารางงวด + เงินต้น/หนี้คงเหลือ + ประมาณการจ่ายล่วงหน้า
// เก็บพารามิเตอร์สัญญาใน DB (ตาราง loans) แล้วสร้างตารางงวดสด ๆ ที่นี่ (ไม่ต้องเก็บทุกงวด)
export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const LOAN_KINDS = { vehicle: "🚗 รถ (เช่าซื้อ)", office: "🏢 สินเชื่อออฟฟิศ", other: "📄 อื่นๆ" };
export const LOAN_METHODS = {
  flat: "เช่าซื้อ (ดอกเบี้ยคงที่)",
  reducing: "ลดต้นลดดอก (effective)",
  stepped: "ค่างวดขั้นบันได (ปรับโครงสร้าง/บอลลูน)",
};

// ค่างวดของงวดที่ seq — reducing/flat ใช้ค่างวดคงที่ · stepped อ่านจากช่วง steps + งวดบอลลูนสุดท้าย
export function installmentAt(loan, seq) {
  if ((loan.method || "flat") === "stepped") {
    const term = Number(loan.term_months) || 0, balloon = Number(loan.balloon) || 0;
    if (balloon > 0 && seq === term) return balloon;
    const st = (Array.isArray(loan.steps) ? loan.steps : []).find((s) => seq >= (Number(s.from) || 0) && seq <= (Number(s.to) || 0));
    return st ? Number(st.amount) || 0 : 0;
  }
  return Number(loan.installment) || 0;
}

// วันครบกำหนดของงวดที่ seq (นับ 1) = เดือนของ start_date + (seq-1) เดือน, วันที่ = due_day
export function dueDateOf(startDate, seq, dueDay) {
  const s = new Date((startDate || new Date().toISOString().slice(0, 10)) + (String(startDate).length <= 10 ? "T00:00:00" : ""));
  const d = new Date(s.getFullYear(), s.getMonth() + (seq - 1), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(Number(dueDay) || s.getDate() || 5, last));
  return d;
}

// ตารางผ่อนทั้งสัญญา — คืน array ต่อ งวด { seq, due, installment, vat, interest, principal, balance }
export function buildSchedule(loan) {
  const term = Math.max(0, Number(loan.term_months) || 0);
  const inst = Number(loan.installment) || 0;          // ค่างวดรวม (รวม VAT)
  const vat = Number(loan.vat_per) || 0;               // VAT ต่องวด (คงที่)
  const pi = r2(inst - vat);                            // เงินต้น+ดอก ต่องวด
  const method = loan.method || "flat";
  const dueDay = Number(loan.due_day) || 5;
  const rows = [];
  if (method === "stepped") {
    // ค่างวดขั้นบันได — ไม่แยกเงินต้น/ดอก (สินเชื่อปรับโครงสร้างพักดอกเบี้ย) · balance คือยอดจ่ายคงเหลือ
    let remain = 0;
    for (let i = 1; i <= term; i++) remain += installmentAt(loan, i);
    for (let i = 1; i <= term; i++) {
      const amt = installmentAt(loan, i);
      remain = r2(remain - amt);
      rows.push({ seq: i, due: dueDateOf(loan.start_date, i, dueDay), installment: amt, vat: 0, interest: null, principal: null, balance: r2(Math.max(0, remain)), balloon: !!(Number(loan.balloon) > 0 && i === term) });
    }
    return rows;
  }
  if (method === "reducing") {
    const rMonthly = (Number(loan.rate) || 0) / 1200;  // rate เก็บเป็น %/ปี
    let bal = Number(loan.principal) || 0;
    for (let i = 1; i <= term; i++) {
      let interest = r2(bal * rMonthly);
      let principal = r2(pi - interest);
      if (i === term || principal >= bal) { principal = bal; interest = r2(pi - principal); } // งวดสุดท้ายปิดยอด
      bal = r2(bal - principal); if (bal < 0) bal = 0;
      rows.push({ seq: i, due: dueDateOf(loan.start_date, i, dueDay), installment: inst, vat, interest, principal, balance: bal });
      if (bal <= 0) break;
    }
  } else {
    // flat (เช่าซื้อดอกคงที่) — ดอกเบี้ยเท่ากันทุกงวด
    const principal0 = Number(loan.principal) || r2(pi * term);   // ไม่รู้ยอดจัด → ใช้ pi×term (ดอก=0)
    const totalInt = Math.max(0, r2(pi * term - principal0));
    const intPer = term ? r2(totalInt / term) : 0;
    const prinPer = r2(pi - intPer);
    let bal = principal0;
    for (let i = 1; i <= term; i++) {
      let principal = prinPer, interest = intPer;
      if (i === term) principal = bal;
      bal = r2(bal - principal); if (bal < 0) bal = 0;
      rows.push({ seq: i, due: dueDateOf(loan.start_date, i, dueDay), installment: inst, vat, interest, principal, balance: bal });
    }
  }
  return rows;
}

// สรุปสถานะ ณ ปัจจุบัน (อิง paid_count)
export function loanStatus(loan) {
  const sched = buildSchedule(loan);
  const term = sched.length;
  const paid = Math.min(Math.max(0, Number(loan.paid_count) || 0), term);
  const remainInst = Math.max(0, term - paid);
  const stepped = (loan.method || "flat") === "stepped";
  const payoffLeft = r2(sched.slice(paid).reduce((s, x) => s + (Number(x.installment) || 0), 0));  // หนี้ที่ต้องจ่ายจริง = ผลรวมค่างวดที่เหลือ
  const opening = Number(loan.principal) || (!stepped && sched[0] ? r2(sched[0].balance + sched[0].principal) : 0);
  const principalLeft = stepped ? null : (paid > 0 ? (sched[paid - 1]?.balance ?? 0) : opening);   // สินเชื่อขั้นบันไดพักดอกเบี้ย → ไม่แยกเงินต้น
  const totalInterest = stepped ? null : r2(sched.reduce((s, x) => s + (x.interest || 0), 0));
  const interestLeft = stepped ? null : r2(sched.slice(paid).reduce((s, x) => s + (x.interest || 0), 0));
  const next = sched[paid] || null;                                       // งวดถัดไปที่ต้องจ่าย
  const last = sched[term - 1] || null;
  return { sched, term, paid, remainInst, stepped, opening, principalLeft, interestLeft, totalInterest, payoffLeft, next, last };
}

// ประมาณการจ่ายล่วงหน้า (งวดที่ยังไม่จ่าย) — ป้อนกระแสเงินสด/กราฟ
export function projection(loan) {
  const { sched, paid } = loanStatus(loan);
  return sched.slice(paid).map((r) => ({ seq: r.seq, due: r.due, amount: r.installment }));
}

// รวมประมาณการรายเดือนของหลายสัญญา (สำหรับกราฟ 12 เดือนหน้าในหน้าหนี้สินรวม)
export function monthlyOutlook(loans, months = 12) {
  const now = new Date();
  const out = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let amount = 0;
    loans.forEach((ln) => {
      if (ln.active === false) return;
      const st = loanStatus(ln);
      st.sched.slice(st.paid).forEach((r) => {
        if (r.due.getFullYear() === d.getFullYear() && r.due.getMonth() === d.getMonth()) amount += r.installment;
      });
    });
    out.push({ key, date: d, amount: r2(amount) });
  }
  return out;
}
