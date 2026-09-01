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
    const lvRaw = leaveDaySet[emp.id]?.[k];
    // ⚠️ นับวันลาเฉพาะ "วันทำงานของคนนั้น" เท่านั้น — ใบลาที่คร่อมเสาร์-อาทิตย์/วันหยุดบริษัท
    // ตอนยื่นคิด days จากวันทำงานจริงอยู่แล้ว (leaveDays ใน lib/hr.js) ถ้าตรงนี้นับทุกวันปฏิทิน
    // ลาไม่รับค่าแรง ศุกร์→จันทร์ จะกลายเป็น 4 วันแทน 2 วัน = หักเงินสองเท่า
    const isWork = isWorkday(k, emp.work_pattern || "mon_sat", emp.sat_group, holSet);
    const lv = lvRaw && isWork ? lvRaw : null;
    if (lv) {
      const frac = leaveFrac(lv);
      leaveDays += frac;
      if (lv.t === "unpaid") unpaidLeave += frac;   // ลาไม่รับค่าแรง → หักเงินเสมอ (ผ่าน overLeave)
      if (!lv.h) { days.push({ d: k, kind: "leave", lt: lv.t, frac: r2(frac) }); continue; } // ลาเต็มวัน — ไม่นับเข้างาน/ขาดของวันนั้น
    }
    if (!isWork) {
      // มาทำงานวันหยุด — คิดค่าวันหยุดตามกฎหมาย (ม.62–63): แยกชั่วโมงเป็น 8 ชม.แรก กับส่วนเกิน (OT วันหยุด)
      // ⚠️ ต้อง "รับรองก่อนถึงจ่าย" (mig 191): คิดค่าวันหยุดเฉพาะวันที่ HR กดรับรองแล้ว (hol_ok)
      //    วันที่ยังไม่รับรอง = โชว์ว่ามาทำงาน (holidayDays/holidayMin) แต่ยังไม่คิดเงิน (holNorm/holOt = 0)
      const a = attByUserDay[emp.id]?.[k];
      if (a?.check_in_at) {
        holidayDays++;
        const okHol = !!a.hol_ok;
        let dayNormMin = 0, dayOtH = 0, spanH = 0;
        if (a.check_out_at) {
          const span = Math.max(0, (minutesOf(a.check_out_at) ?? 0) - (minutesOf(a.check_in_at) ?? 0));
          holidayMin += span; spanH = r2(span / 60);   // ชั่วโมงดิบไว้โชว์บนป้าย (เหมือนเดิม)
          if (okHol) {
            // ชั่วโมงงานจริง = ช่วงเวลาอยู่ − พักเที่ยง 1 ชม. เมื่ออยู่เกิน 5 ชม. (กะปกติ 08–17 = ช่วง 9 ชม. = งาน 8 ชม.)
            const workMin = span > 300 ? span - 60 : span;
            dayNormMin = Math.min(workMin, 480);
            dayOtH = otCreditHours(Math.max(0, workMin - 480));  // OT วันหยุด นับบล็อกครึ่ง ชม. เหมือน OT ปกติ
            holNormMin += dayNormMin; holOtHours += dayOtH;
          }
        }
        days.push({ d: k, kind: "holiday", hours: spanH, normH: r2(dayNormMin / 60), otH: r2(dayOtH), noOut: !a.check_out_at, holOk: okHol });
      }
      continue;
    }
    workdays++;
    const a = attByUserDay[emp.id]?.[k];
    // OT rounded per-day (½-hour blocks) then summed — so sub-30-min days never accumulate
    // เปิดตั้งค่า "OT ต้องรับรอง" (mig 144): นับ OT เฉพาะวันที่ HR กดรับรองแล้ว (ot_ok) — กัน OT อัตโนมัติจากการเช็คเอาท์ช้า
    if (a?.check_in_at) {
      // ลาคาบช่วงเช้า (from ≤ เวลาเข้ากะ) → เริ่มนับสายจากเวลาเลิกลา · เลิกลาตกช่วงพักเที่ยง → เริ่มงานหลังพัก
      // (เช่น ลา 08:00–12:00 + พักเที่ยง 12:00–13:00 → เริ่มนับสายจาก 13:00)
      let startOv = null;
      if (lv?.h && lv.from && lv.to) {
        const shiftStart = minutesOf(settings?.start || "08:00");
        const lf = minutesOf(lv.from); let lt = minutesOf(lv.to);
        if (lf != null && lt != null && lf <= shiftStart) {
          const lunchS = minutesOf(settings?.lunchStart || "12:00"), lunchE = minutesOf(settings?.lunchEnd || "13:00");
          if (lunchS != null && lunchE != null && lt >= lunchS && lt < lunchE) lt = lunchE;   // เลิกลาช่วงพักเที่ยง → เริ่มงานหลังพัก
          startOv = lt;
        }
      }
      present++; const s = dayStat(a, settings, startOv);
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
  const allow = emp.allow || {}, allowance = allowanceTotal(allow);   // เงินเพิ่ม/สวัสดิการ (ค่าโทร/AI/ที่พัก/อื่น) — บวกเข้ารายได้
  const dLoan = Number(emp.loan) || 0, dWater = Number(emp.water) || 0, dElectric = Number(emp.electric) || 0;   // เงินยืม(ผ่อน)/ค่าน้ำ/ค่าไฟ (mig 184)
  const dAdvance = Number(emp.advance) || 0;   // เบิกเงินล่วงหน้า ที่อนุมัติแล้ว → หักในรอบนี้
  // ค่าทำงานวันหยุด (พ.ร.บ.คุ้มครองแรงงาน ม.62–63 · เจ้าของเคาะ 2026-07-17 จ่ายตามกฎหมายเต็ม):
  //   8 ชม.แรก → รายเดือนได้ "เพิ่ม 1 เท่า" ของรายชั่วโมง (เงินเดือนจ่ายฐานวันหยุดไว้แล้ว) · รายวันได้ 2 เท่า
  //   ส่วนเกิน 8 ชม. → OT วันหยุด 3 เท่า (ทั้งรายเดือน/รายวัน)
  const holNormHours = Number(st.holNormHours) || 0;
  const holOtHours = Number(st.holOtHours) || 0;
  const holPay = r0(holNormHours * hourly * (monthly ? 1 : 2) + holOtHours * hourly * 3);
  const gross = base + otPay + holPay + bonus + allowance;
  // เบิกล่วงหน้ามากกว่าเงินที่เหลือรับ → เดิมสุทธิติดลบ แล้วระบบปิดใบเบิกทั้งหมดว่า "หักแล้ว" หนี้ส่วนเกินหายไปเฉย ๆ
  // ⇒ หักได้ไม่เกินยอดที่เหลือจริง · ส่วนที่หักไม่ไหวส่งกลับไปเป็น advanceCarry ให้ยกไปหักรอบถัดไป
  // ภาษีหัก ณ ที่จ่าย ภ.ง.ด.1 — ยอดคงที่ต่อเดือนที่บัญชีเคาะ (mig 161) ยังไม่คิดขั้นบันไดอัตโนมัติ
  const dTax = Number(emp.tax_wht) || 0;
  // ต้องอยู่ใน dedBefore ไม่ใช่บวกท้าย ded — เพื่อให้เพดานหักเบิกล่วงหน้า (advCap) ลดลงตาม
  // คือหักเบิกล่วงหน้าได้ไม่เกินเงินที่เหลือ "หลังหักภาษีแล้ว" จริง ๆ
  const dedBefore = dLate + dAbsent + dLeave + dSso + dTax + dLoan + dWater + dElectric + otherDeduct;
  const advCap = Math.max(0, gross - dedBefore);
  const dAdvanceApplied = Math.min(dAdvance, advCap);
  const advanceCarry = r0(dAdvance - dAdvanceApplied);   // > 0 = ยังค้าง ต้องยกไปรอบหน้า
  const ded = dedBefore + dAdvanceApplied;
  return { monthly, base, otHours, otPay, holPay, holNormHours, holOtHours, dLate, dAbsent, dLeave, dSso, dTax, dLoan, dWater, dElectric,
    dAdvance: dAdvanceApplied, advanceCarry, bonus, otherDeduct, allow, allowance, gross, ded, net: r0(gross - ded) };
}
// เงินเพิ่ม/สวัสดิการ (เก็บใน payslips.other_note เป็น JSON {al:{phone,ai,lodging,welfare}} — ไม่ต้อง migration)
export const ALLOWANCE_KINDS = [
  { k: "phone", label: "ค่าโทรศัพท์", my: "ဖုန်းခ" },
  { k: "ai", label: "ค่า AI", my: "AI ခ" },
  { k: "lodging", label: "ค่าที่พัก", my: "နေရာထိုင်ခင်းခ" },
  { k: "welfare", label: "สวัสดิการอื่น", my: "အခြားထောက်ပံ့ကြေး" },
];
export function parseAllowances(note) {
  if (!note) return {};
  try { const o = typeof note === "string" ? JSON.parse(note) : note; return (o && o.al) || {}; } catch { return {}; }
}
export function allowanceTotal(al) { al = al || {}; return ALLOWANCE_KINDS.reduce((s, x) => s + (Number(al[x.k]) || 0), 0); }
// ทำ JSON เก็บลง other_note — คืน null ถ้าไม่มีเงินเพิ่มเลย (กันเขียนขยะ)
export function allowanceNote(al) { const t = allowanceTotal(al); return t > 0 ? JSON.stringify({ al: Object.fromEntries(ALLOWANCE_KINDS.map((x) => [x.k, Number(al?.[x.k]) || 0])) }) : null; }

// ⚠️ รอบที่จ่ายแล้ว = ประวัติ ต้องอ่านจากสลิปที่บันทึกไว้ ห้ามคำนวณใหม่
//    ไม่งั้นแก้กติกาการนับทีไร ตัวเลขเดือนที่จ่ายไปแล้วขยับตาม พนักงานเปิดสลิปเก่าแล้วเลขไม่ตรงกับเงินที่ได้รับจริง
//    ใช้ร่วมกัน 2 หน้า: ตารางเงินเดือนฝั่ง HR และ "เงินเดือนของฉัน" ในหน้าเข้างาน/ลา — ห้ามก๊อปไปไว้คนละที่อีก
export function frozenPayslip(s) {
  const allow = parseAllowances(s.other_note), allowance = allowanceTotal(allow);
  return {
    monthly: (s.pay_type || "monthly") === "monthly",
    base: Number(s.base) || 0, otHours: (Number(s.ot_min) || 0) / 60, otPay: Number(s.ot_pay) || 0,
    holPay: Number(s.hol_pay) || 0, holNormHours: 0, holOtHours: 0,
    dLate: Number(s.d_late) || 0, dAbsent: Number(s.d_absent) || 0, dLeave: Number(s.d_leave) || 0,
    dSso: Number(s.d_sso) || 0, dTax: Number(s.d_tax) || 0, dAdvance: Number(s.d_advance) || 0, advanceCarry: 0,
    dLoan: Number(s.d_loan) || 0, dWater: Number(s.d_water) || 0, dElectric: Number(s.d_electric) || 0,
    bonus: Number(s.bonus) || 0, otherDeduct: Number(s.other_deduct) || 0, allow, allowance,
    gross: (Number(s.base) || 0) + (Number(s.ot_pay) || 0) + (Number(s.hol_pay) || 0) + (Number(s.bonus) || 0) + allowance,
    // ⚠️ ห้ามใส่ 0 ตายตัว — เดิม ded: 0 ทำให้สลิปที่จ่ายแล้วพิมพ์ "รวมรายการหัก −฿0.00"
    //    ทั้งที่บรรทัดหักมาสาย/ขาดงาน/ประกันสังคม/ภาษี ด้านบนมีตัวเลขจริง เลขบนสลิปเลยบวกไม่ลง
    //    และปุ่มส่งสลิปให้พนักงานทำงานเฉพาะรอบที่จ่ายแล้ว = ทุกใบที่ส่งออกไปถือเลข 0 นี้
    //    รวมจากรายการหักที่เก็บไว้จริง (ควรเท่ากับ gross − net ของสลิปที่บันทึกถูกต้อง)
    ded: (Number(s.d_late) || 0) + (Number(s.d_absent) || 0) + (Number(s.d_leave) || 0)
       + (Number(s.d_sso) || 0) + (Number(s.d_tax) || 0) + (Number(s.d_advance) || 0) + (Number(s.other_deduct) || 0)
       + (Number(s.d_loan) || 0) + (Number(s.d_water) || 0) + (Number(s.d_electric) || 0),
    net: Number(s.net) || 0, _frozen: true,
  };
}
