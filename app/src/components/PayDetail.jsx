import React from "react";
import { fmtBaht } from "../lib/format";
import { UIcon } from "../icons";
import { leaveLabel, hrParseYmd } from "../lib/hr";

const thDate = (s) => hrParseYmd(s).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });

// รายละเอียดเงินเดือนรายวัน — ใช้ 2 ที่: HR → เงินเดือน (กดจากช่องไหนก็ได้ในตาราง) และ เข้างาน/ลา (พนักงานดูของตัวเอง)
// OT วันไหนกี่ ชม. · สายวันไหนกี่นาที · ขาด/ลา/วันหยุด/เบิกล่วงหน้า ครบทุกช่อง
export default function PayDetailModal({ r, c, advRows, otRows, settings, period, note, lang, onClose }) {
  // lang="my" = ช่างพม่า (สวิตช์ภาษาหน้า เข้างาน/ลา) — หัวข้อ/ข้อความหลักเป็นพม่า · ตัวเลข/วันที่คงรูปแบบไทยเหมือนหน้าอื่น
  const t = (th, my) => (lang === "my" && my ? my : th);
  const p = r.p, st = r.st, days = st.days || [];
  const monthly = (p.pay_type || "monthly") === "monthly";
  const basePay = Number(p.base_pay) || 0;
  const hourly = monthly ? basePay / 30 / 8 : basePay / 8;
  const daily = monthly ? basePay / 30 : basePay;
  const otDays = days.filter((d) => d.kind === "work" && d.otH > 0);
  const lateDays = days.filter((d) => d.kind === "work" && d.lateMin > 0);
  const absentDays = days.filter((d) => d.kind === "absent");
  const holDays = days.filter((d) => d.kind === "holiday");
  const leaveDays = days.filter((d) => d.kind === "leave" || d.leaveH > 0);
  const presentDays = days.filter((d) => d.kind === "work");
  const Sec = ({ title, amount, neg, children }) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: "1px solid var(--line)", paddingBottom: 4, marginBottom: 6 }}>
        <b style={{ fontSize: 13 }}>{title}</b>
        {amount != null && <b style={{ color: neg ? "var(--down)" : "var(--up)" }}>{neg ? "−" : ""}{fmtBaht(amount)}</b>}
      </div>
      {children}
    </div>
  );
  const Row = ({ l, v, dim }) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "2.5px 0", color: dim ? "var(--ink-2)" : "inherit" }}>
      <span>{l}</span><span style={{ whiteSpace: "nowrap", textAlign: "right" }}>{v}</span>
    </div>
  );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div className="modal-head"><div className="modal-title">{t("รายละเอียดเงินเดือน", "လစာ အသေးစိတ်")} · {p.name || p.email}<span>{monthly ? t("รายเดือน", "လစဉ်") : t("รายวัน", "နေ့စား")} · {t("งวด", "ကာလ")} {period}</span></div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          {note && <p className="page-sub" style={{ marginTop: 0 }}>{note}</p>}
          <Sec title={monthly ? t("ฐานเงินเดือน", "လစာ အခြေခံ") : `${t("ฐานค่าแรง", "နေ့စားလုပ်ခ")} (${t("มา", "လာ")} ${st.present} ${t("วัน", "ရက်")} × ${fmtBaht(daily)})`} amount={c.base}>
            {!monthly && <Row l={`${t("วันที่มาทำงาน", "အလုပ်လာသည့်ရက်")} ${st.present} ${t("วัน", "ရက်")}`} v={presentDays.map((d) => thDate(d.d)).join(" · ") || "—"} dim />}
            {monthly && <Row l={`${t("เงินเดือนเต็ม", "လစာအပြည့်")} · ${t("เรตรายวัน", "တစ်ရက်နှုန်း")} ${fmtBaht(daily)} · ${t("รายชั่วโมง", "တစ်နာရီနှုန်း")} ${fmtBaht(hourly)}`} v="" dim />}
          </Sec>
          <Sec title={`${t("ค่าล่วงเวลา OT", "အချိန်ပို OT")} (${(c.otHours || 0).toFixed(1)} ${t("ชม.", "နာရီ")} × ${fmtBaht(Number(p.ot_rate) || 0)}/${t("ชม.", "နာရီ")})`} amount={c.otPay}>
            {/* จากใบขอ OT จริง (mig 184) — โชว์เลขงาน+รายละเอียด · ถอยไปใช้ OT อัตโนมัติรายวันเฉพาะกรณีเก่าที่ไม่ได้ส่ง otRows */}
            {otRows ? (<>
              {otRows.length === 0 && <Row l={t("ไม่มี OT ในรอบนี้", "ဒီကာလတွင် OT မရှိပါ")} v="" dim />}
              {otRows.map((o) => <Row key={o.id} l={`${thDate(o.ot_date)} · ${o.time_from || ""}${o.time_to ? `–${o.time_to}` : ""}${o.job_no ? ` · 🔧 ${o.job_no}${o.jobCustomer ? ` ${o.jobCustomer}` : ""}${o.jobDetails ? ` (${o.jobDetails})` : ""}` : ""}`} v={`${Number(o.hours || 0).toFixed(1)} ${t("ชม.", "နာရီ")}${Number(o.hours) > 0 ? ` = ${fmtBaht(Number(o.hours) * (Number(p.ot_rate) || 0))}` : t(" · ⏳ รอเช็คเอาท์", " · ⏳ ထွက်ရန်")}`} />)}
            </>) : (<>
              {otDays.length === 0 && <Row l={t("ไม่มี OT ในรอบนี้", "ဒီကာလတွင် OT မရှိပါ")} v="" dim />}
              {otDays.map((d) => <Row key={d.d} l={thDate(d.d)} v={`${d.otH.toFixed(1)} ${t("ชม.", "နာရီ")}${d.otCounted ? ` = ${fmtBaht(d.otH * (Number(p.ot_rate) || 0))}` : t(" · ⏳ ยังไม่รับรอง (ไม่ถูกคิดเงิน)", " · ⏳ မအတည်ပြုရသေး (မတွက်သေးပါ)")}`} />)}
            </>)}
          </Sec>
          <Sec title={t("ค่าทำงานวันหยุด", "နားရက် အလုပ်ခ")} amount={c.holPay}>
            {holDays.length === 0 && <Row l={t("ไม่ได้มาทำงานวันหยุดในรอบนี้", "ဒီကာလ နားရက်တွင် အလုပ်မလာပါ")} v="" dim />}
            {holDays.map((d) => {
              const pay = Math.round(d.normH * hourly * (monthly ? 1 : 2) + d.otH * hourly * 3);
              return <Row key={d.d} l={`${thDate(d.d)} · อยู่ ${d.hours} ชม.${d.noOut ? " (ไม่ได้เช็คเอาท์ — ไม่ถูกคิดเงิน)" : ` → งาน ${d.normH} ชม. × ${monthly ? "1 เท่า" : "2 เท่า"}${d.otH ? ` + OT ${d.otH} ชม. × 3 เท่า` : ""}`}`} v={d.noOut ? "—" : fmtBaht(pay)} />;
            })}
            {holDays.length > 0 && <Row l={`* หักพักเที่ยง 1 ชม. เมื่ออยู่เกิน 5 ชม. · เรตรายชั่วโมง ${fmtBaht(hourly)}`} v="" dim />}
          </Sec>
          <Sec title={`${t("หักมาสาย", "နောက်ကျ ဖြတ်")} (${t("รวม", "စုစုပေါင်း")} ${Math.round(st.lateMin || 0)} ${t("นาที", "မိနစ်")} × ${fmtBaht(hourly)}/${t("ชม.", "နာရီ")})`} amount={c.dLate} neg>
            {lateDays.length === 0 && <Row l={t("ไม่มีสายในรอบนี้ (หรือไม่เกินผ่อนผัน)", "ဒီကာလ နောက်ကျမှု မရှိပါ")} v="" dim />}
            {lateDays.map((d) => <Row key={d.d} l={thDate(d.d)} v={`${t("สาย", "နောက်ကျ")} ${Math.round(d.lateMin)} ${t("นาที", "မိနစ်")} = ${fmtBaht(d.lateMin / 60 * hourly)}`} />)}
          </Sec>
          <Sec title={`${t("หักขาดงาน", "ပျက်ကွက် ဖြတ်")} (${st.absent} ${t("วัน", "ရက်")}${monthly ? ` × ${fmtBaht(daily)}` : t(" — รายวันไม่หัก (ไม่มาไม่ได้ค่าแรงอยู่แล้ว)", " — နေ့စားမဖြတ်ပါ")})`} amount={c.dAbsent} neg>
            {absentDays.length === 0 && <Row l={t("ไม่มีขาดงานในรอบนี้", "ဒီကာလ ပျက်ကွက်မှု မရှိပါ")} v="" dim />}
            {absentDays.map((d) => <Row key={d.d} l={thDate(d.d)} v={d.leaveH ? `${t("ลา", "ခွင့်")} ${d.leaveH} ${t("ชม.", "နာရီ")} ${t("แต่ไม่ได้เช็คอิน", "သို့သော် check-in မရှိ")}` : (monthly ? "−" + fmtBaht(daily) : t("ไม่ได้ค่าแรงวันนี้", "ဒီနေ့ လုပ်ခမရပါ"))} />)}
          </Sec>
          <Sec title={`${t("ลาในรอบนี้", "ဒီကာလ ခွင့်")} (${st.leaveDays} ${t("วัน", "ရက်")}) · ${t("หักลาเกินโควตา/ลาไม่รับค่าแรง", "ခွင့်ကျော်/လစာမဲ့ခွင့် ဖြတ်")} ${st.overLeave || 0} ${t("วัน", "ရက်")}`} amount={c.dLeave} neg>
            {leaveDays.length === 0 && <Row l={t("ไม่มีลาในรอบนี้", "ဒီကာလ ခွင့်မရှိပါ")} v="" dim />}
            {leaveDays.map((d) => <Row key={d.d + (d.lt || "")} l={thDate(d.d)} v={`${leaveLabel(d.lt)}${d.kind === "leave" ? (d.frac < 1 ? ` ${d.frac} วัน` : " เต็มวัน") : ` ${d.leaveH} ชม.`}`} />)}
            {(st.overLeave || 0) > 0 && <Row l={`ส่วนที่ถูกหัก = เกินโควตาปีนี้ที่เกิดในรอบ + ลาไม่รับค่าแรง (${st.overLeave} วัน × ${fmtBaht(daily)})`} v="" dim />}
          </Sec>
          <Sec title={t("ประกันสังคม 5%", "လူမှုဖူလုံရေး 5%")} amount={c.dSso} neg>
            <Row l={c.dSso ? `ฐาน ${fmtBaht(Math.min(monthly ? basePay : c.base, 17500))} (เพดาน 17,500) × 5%` : "ไม่ได้ติ๊กประกันสังคม (ตั้งได้ที่ กะ & ตั้งค่า)"} v="" dim />
          </Sec>
          <Sec title={t("ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1)", "အခွန်ဖြတ်")} amount={c.dTax} neg>
            <Row l={c.dTax ? t("ยอดคงที่ต่อเดือนที่ฝ่ายบัญชีกำหนด", "အခွန်ဌာနက သတ်မှတ်သည့် လစဉ်ပုံသေ") : t("ไม่มีภาษีหัก ณ ที่จ่ายในรอบนี้", "ဒီကာလ အခွန်ဖြတ်ခြင်း မရှိပါ")} v="" dim />
          </Sec>
          <Sec title={t("หักเบิกเงินล่วงหน้า", "ကြိုတင်ငွေ ဖြတ်")} amount={c.dAdvance} neg>
            {(advRows || []).length === 0 && <Row l={t("ไม่มีเบิกล่วงหน้าค้างหักในรอบนี้", "ဒီကာလ ကြိုတင်ငွေ ဖြတ်စရာ မရှိပါ")} v="" dim />}
            {(advRows || []).map((a) => <Row key={a.id} l={`${a.created_at ? thDate(a.created_at.slice(0, 10)) : ""}${a.reason ? ` · ${a.reason}` : ""}`} v={"−" + fmtBaht(a.amount)} />)}
          </Sec>
          {c.dLoan > 0 && (
            <Sec title={t("หักเงินยืม (งวดรอบนี้)", "ချေးငွေ ဖြတ် (ဒီကာလ)")} amount={c.dLoan} neg>
              <Row l={t("งวดผ่อนเงินยืมที่ตัดอัตโนมัติในรอบนี้", "ဒီကာလ အလိုအလျောက် ဖြတ်သည့် ချေးငွေအရစ်")} v="" dim />
            </Sec>
          )}
          {c.dWater > 0 && (
            <Sec title={t("หักค่าน้ำ", "ရေဖိုး ဖြတ်")} amount={c.dWater} neg>
              <Row l={t("ยอดที่ระบุในตารางเงินเดือนรอบนี้", "ဒီကာလ လစာဇယားတွင် သတ်မှတ်သည့်ပမာဏ")} v="" dim />
            </Sec>
          )}
          {c.dElectric > 0 && (
            <Sec title={t("หักค่าไฟ", "မီးဖိုး ဖြတ်")} amount={c.dElectric} neg>
              <Row l={t("ยอดที่ระบุในตารางเงินเดือนรอบนี้", "ဒီကာလ လစာဇယားတွင် သတ်မှတ်သည့်ပမာဏ")} v="" dim />
            </Sec>
          )}
          {(c.bonus > 0 || c.otherDeduct > 0) && (
            <Sec title={t("ปรับมือรอบนี้", "ဒီကာလ ချိန်ညှိ")} amount={null}>
              {c.bonus > 0 && <Row l={t("โบนัส/เบี้ยเลี้ยง", "ဘောနပ်စ်/စရိတ်")} v={"+" + fmtBaht(c.bonus)} />}
              {c.otherDeduct > 0 && <Row l={t("หักอื่น ๆ", "အခြား ဖြတ်ငွေ")} v={"−" + fmtBaht(c.otherDeduct)} />}
            </Sec>
          )}
          <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <b>{t("รวมรายได้", "စုစုပေါင်းဝင်ငွေ")} {fmtBaht(c.gross)} − {t("รายการหัก", "ဖြတ်ငွေ")} {fmtBaht(c.ded)}</b>
            <b style={{ color: "var(--up)" }}>{t("สุทธิ", "အသားတင်")} {fmtBaht(c.net)}</b>
          </div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>{t("ปิด", "ပိတ်")}</button></div>
      </div>
    </div>
  );
}
