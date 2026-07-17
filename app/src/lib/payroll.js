// Payroll math — pure functions. Pay cycle cut-off 25th: period = 26th prev month → 25th this month.
import { hrParseYmd, hrYmd, isWorkday, dayStat, leaveFrac, minutesOf, otCreditHours } from "./hr";

const pad = (n) => String(n).padStart(2, "0");
// the [from,to] dates for a pay month 'YYYY-MM' (paid that month): 26th of prev month → 25th of this month
export function payPeriod(ym) {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(y, m - 2, 26);   // 26th of previous month
  const end = new Date(y, m - 1, 25);     // 25th of this month
  return { from: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`, to: `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}` };
}

// attendance/leave stats for one person over [from,to]
// leaveDaySet values are { t: type, h: hours|null } (see buildLeaveDaySet) — ลาราย ชม. นับเป็นเศษวัน และวันนั้นยังนับเข้างานตามปกติ
export function periodStats(emp, attByUserDay, leaveDaySet, from, to, holSet, settings) {
  let present = 0, lateCnt = 0, lateMin = 0, otMin = 0, otHours = 0, absent = 0, workdays = 0, leaveDays = 0, unpaidLeave = 0, holidayDays = 0, holidayMin = 0, holNormMin = 0, holOtHours = 0;
  const r2 = (n) => Math.round(n * 100) / 100;
  const days = [];   // รายละเอียดรายวัน — ให้หน้าเงินเดือนกดดูที่มาของทุกช่องได้ (OT วันไหน/สายวันไหน/ขาดวันไหน ฯลฯ)
  for (let d = hrParseYmd(from); d <= hrParseYmd(to); d.setDate(d.getDate() + 1)) {
    const k = hrYmd(d);
    const lv = leaveDaySet[emp.id]?.[k];
    if (lv) {
      const frac = leaveFrac(lv);
      leaveDays += frac;
      if (lv.t === "unpaid") unpaidLeave += frac;   // ลาไม่รับค่าแรง → หักเงินเสมอ (ผ่าน overLeave)
      if (!lv.h) { days.push({ d: k, kind: "leave", lt: lv.t, frac: r2(frac) }); continue; } // ลาเต็มวัน — ไม่นับเข้างาน/ขาดของวันนั้น
    }
    if (!isWorkday(k, emp.work_pattern || "mon_sat", emp.sat_group, holSet)) {
      // มาทำงานวันหยุด — คิดค่าวันหยุดตามกฎหมาย (ม.62–63): แยกชั่วโมงเป็น 8 ชม.แรก กับส่วนเกิน (OT วันหยุด)
      const a = attByUserDay[emp.id]?.[k];
      if (a?.check_in_at) {
        holidayDays++;
        let dayNormMin = 0, dayOtH = 0, spanH = 0;
        if (a.check_out_at) {
          const span = Math.max(0, (minutesOf(a.check_out_at) ?? 0) - (minutesOf(a.check_in_at) ?? 0));
          holidayMin += span; spanH = r2(span / 60);   // ชั่วโมงดิบไว้โชว์บนป้าย (เหมือนเดิม)
          // ชั่วโมงงานจริง = ช่วงเวลาอยู่ − พักเที่ยง 1 ชม. เมื่ออยู่เกิน 5 ชม. (กะปกติ 08–17 = ช่วง 9 ชม. = งาน 8 ชม.)
          const workMin = span > 300 ? span - 60 : span;
          dayNormMin = Math.min(workMin, 480);
          dayOtH = otCreditHours(Math.max(0, workMin - 480));  // OT วันหยุด นับบล็อกครึ่ง ชม. เหมือน OT ปกติ
          holNormMin += dayNormMin; holOtHours += dayOtH;
        }
        days.push({ d: k, kind: "holiday", hours: spanH, normH: r2(dayNormMin / 60), otH: r2(dayOtH), noOut: !a.check_out_at });
      }
      continue;
    }
    workdays++;
    const a = attByUserDay[emp.id]?.[k];
    // OT rounded per-day (½-hour blocks) then summed — so sub-30-min days never accumulate
    // เปิดตั้งค่า "OT ต้องรับรอง" (mig 144): นับ OT เฉพาะวันที่ HR กดรับรองแล้ว (ot_ok) — กัน OT อัตโนมัติจากการเช็คเอาท์ช้า
    if (a?.check_in_at) {
      present++; const s = dayStat(a, settings);
      const counted = !settings?.otNeedsApproval || !!a.ot_ok;
      if (s.isLate) { lateCnt++; lateMin += s.lateMin; }
      if (counted) { otMin += s.otMin; otHours += s.otHours; }
      days.push({ d: k, kind: "work", lateMin: s.isLate ? s.lateMin : 0, otH: s.otHours, otCounted: counted, leaveH: lv?.h || 0, lt: lv?.t || null });
    } else { absent++; days.push({ d: k, kind: "absent", leaveH: lv?.h || 0, lt: lv?.t || null }); }
  }
  return { present, lateCnt, lateMin, otMin, otHours, absent, workdays, leaveDays: r2(leaveDays), unpaidLeave: r2(unpaidLeave), holidayDays, holidayHours: r2(holidayMin / 60), holNormHours: r2(holNormMin / 60), holOtHours: r2(holOtHours), days };
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
  // ค่าทำงานวันหยุด (พ.ร.บ.คุ้มครองแรงงาน ม.62–63 · เจ้าของเคาะ 2026-07-17 จ่ายตามกฎหมายเต็ม):
  //   8 ชม.แรก → รายเดือนได้ "เพิ่ม 1 เท่า" ของรายชั่วโมง (เงินเดือนจ่ายฐานวันหยุดไว้แล้ว) · รายวันได้ 2 เท่า
  //   ส่วนเกิน 8 ชม. → OT วันหยุด 3 เท่า (ทั้งรายเดือน/รายวัน)
  const holNormHours = Number(st.holNormHours) || 0;
  const holOtHours = Number(st.holOtHours) || 0;
  const holPay = r0(holNormHours * hourly * (monthly ? 1 : 2) + holOtHours * hourly * 3);
  const gross = base + otPay + holPay + bonus;
  const ded = dLate + dAbsent + dLeave + dSso + otherDeduct + dAdvance;
  return { monthly, base, otHours, otPay, holPay, holNormHours, holOtHours, dLate, dAbsent, dLeave, dSso, dAdvance, bonus, otherDeduct, gross, ded, net: gross - ded };
}
