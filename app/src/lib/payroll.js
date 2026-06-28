// Payroll math — pure functions. Pay cycle cut-off 25th: period = 26th prev month → 25th this month.
import { hrParseYmd, hrYmd, isWorkday, dayStat } from "./hr";

const pad = (n) => String(n).padStart(2, "0");
// the [from,to] dates for a pay month 'YYYY-MM' (paid that month): 26th of prev month → 25th of this month
export function payPeriod(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 2, 26);   // 26th of previous month
  const end = new Date(y, m - 1, 25);     // 25th of this month
  return { from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`, to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` };
}

// attendance/leave stats for one person over [from,to]
export function periodStats(emp, attByUserDay, leaveDaySet, from, to, holSet, settings) {
  let present = 0, lateCnt = 0, lateMin = 0, otMin = 0, otHours = 0, absent = 0, workdays = 0, leaveDays = 0;
  for (let d = hrParseYmd(from); d <= hrParseYmd(to); d.setDate(d.getDate() + 1)) {
    const k = hrYmd(d);
    if (leaveDaySet[emp.id]?.[k]) { leaveDays++; continue; }
    if (!isWorkday(k, emp.work_pattern || "mon_sat", emp.sat_group, holSet)) continue;
    workdays++;
    const a = attByUserDay[emp.id]?.[k];
    // OT rounded per-day (½-hour blocks) then summed — so sub-30-min days never accumulate
    if (a?.check_in_at) { present++; const s = dayStat(a, settings); if (s.isLate) { lateCnt++; lateMin += s.lateMin; } otMin += s.otMin; otHours += s.otHours; }
    else absent++;
  }
  return { present, lateCnt, lateMin, otMin, otHours, absent, workdays, leaveDays };
}

const r0 = (n) => Math.round(Number(n) || 0);
// compute a payslip line. opt = { deductLate, deductAbsent, deductOverLeave } (default all true). overLeave = unpaid leave days.
export function computePayslip(emp, st, opt = {}) {
  const monthly = (emp.pay_type || "monthly") === "monthly";
  const basePay = Number(emp.base_pay) || 0;
  const hourly = monthly ? basePay / 30 / 8 : basePay / 8;
  const daily = monthly ? basePay / 30 : basePay;
  const base = monthly ? basePay : r0((st.present || 0) * daily);   // daily wage → paid per day present
  // OT credited in ½-hour blocks (rounded down per day) — periodStats provides the pre-rounded sum
  const otHours = st.otHours != null ? Number(st.otHours) || 0 : (st.otMin || 0) / 60;
  const otPay = r0(otHours * (Number(emp.ot_rate) || 0));
  const overLeave = Number(st.overLeave) || 0;
  const dLate = opt.deductLate === false ? 0 : r0((st.lateMin || 0) / 60 * hourly);
  const dAbsent = (opt.deductAbsent === false || !monthly) ? 0 : r0((st.absent || 0) * daily); // daily: absence already unpaid
  const dLeave = (opt.deductOverLeave === false || !monthly) ? 0 : r0(overLeave * daily);
  // ประกันสังคม ม.33: หัก 5% ของค่าจ้าง โดยคิดจากเพดานฐานค่าจ้างสูงสุด 17,500 บาท/เดือน
  // (เงินเดือน ≥ 17,500 → 875 เต็มเพดาน · เงินเดือน < 17,500 → 5% ของเงินเดือนจริง)
  const SSO_BASE_CAP = 17500;
  const ssoBase = monthly ? basePay : base;
  const dSso = emp.sso ? r0(Math.min(ssoBase, SSO_BASE_CAP) * 0.05) : 0;
  const bonus = Number(emp.bonus) || 0, otherDeduct = Number(emp.other_deduct) || 0;
  const dAdvance = Number(emp.advance) || 0;   // เบิกเงินล่วงหน้า ที่อนุมัติแล้ว → หักในรอบนี้
  const gross = base + otPay + bonus;
  const ded = dLate + dAbsent + dLeave + dSso + otherDeduct + dAdvance;
  return { monthly, base, otHours, otPay, dLate, dAbsent, dLeave, dSso, dAdvance, bonus, otherDeduct, gross, ded, net: gross - ded };
}
