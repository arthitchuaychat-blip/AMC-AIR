import React from "react";
import { fmtBaht } from "../lib/format";
import { UIcon } from "../icons";
import { leaveLabel, hrParseYmd } from "../lib/hr";

const thDate = (s) => hrParseYmd(s).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });

// รายละเอียดเงินเดือนรายวัน — ใช้ 2 ที่: HR → เงินเดือน (กดจากช่องไหนก็ได้ในตาราง) และ เข้างาน/ลา (พนักงานดูของตัวเอง)
// OT วันไหนกี่ ชม. · สายวันไหนกี่นาที · ขาด/ลา/วันหยุด/เบิกล่วงหน้า ครบทุกช่อง
export default function PayDetailModal({ r, c, advRows, settings, period, note, onClose }) {
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
        <div className="modal-head"><div className="modal-title">รายละเอียดเงินเดือน · {p.name || p.email}<span>{monthly ? "รายเดือน" : "รายวัน"} · งวด {period}</span></div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          {note && <p className="page-sub" style={{ marginTop: 0 }}>{note}</p>}
          <Sec title={monthly ? "ฐานเงินเดือน" : `ฐานค่าแรง (มา ${st.present} วัน × ${fmtBaht(daily)})`} amount={c.base}>
            {!monthly && <Row l={`วันที่มาทำงาน ${st.present} วัน`} v={presentDays.map((d) => thDate(d.d)).join(" · ") || "—"} dim />}
            {monthly && <Row l={`เงินเดือนเต็ม · เรตรายวัน ${fmtBaht(daily)} · รายชั่วโมง ${fmtBaht(hourly)}`} v="" dim />}
          </Sec>
          <Sec title={`ค่าล่วงเวลา OT (${(c.otHours || 0).toFixed(1)} ชม. × ${fmtBaht(Number(p.ot_rate) || 0)}/ชม.)`} amount={c.otPay}>
            {otDays.length === 0 && <Row l="ไม่มี OT ในรอบนี้" v="" dim />}
            {otDays.map((d) => <Row key={d.d} l={thDate(d.d)} v={`${d.otH.toFixed(1)} ชม.${d.otCounted ? ` = ${fmtBaht(d.otH * (Number(p.ot_rate) || 0))}` : " · ⏳ ยังไม่รับรอง (ไม่ถูกคิดเงิน)"}`} />)}
          </Sec>
          <Sec title="ค่าทำงานวันหยุด" amount={c.holPay}>
            {holDays.length === 0 && <Row l="ไม่ได้มาทำงานวันหยุดในรอบนี้" v="" dim />}
            {holDays.map((d) => {
              const pay = Math.round(d.normH * hourly * (monthly ? 1 : 2) + d.otH * hourly * 3);
              return <Row key={d.d} l={`${thDate(d.d)} · อยู่ ${d.hours} ชม.${d.noOut ? " (ไม่ได้เช็คเอาท์ — ไม่ถูกคิดเงิน)" : ` → งาน ${d.normH} ชม. × ${monthly ? "1 เท่า" : "2 เท่า"}${d.otH ? ` + OT ${d.otH} ชม. × 3 เท่า` : ""}`}`} v={d.noOut ? "—" : fmtBaht(pay)} />;
            })}
            {holDays.length > 0 && <Row l={`* หักพักเที่ยง 1 ชม. เมื่ออยู่เกิน 5 ชม. · เรตรายชั่วโมง ${fmtBaht(hourly)}`} v="" dim />}
          </Sec>
          <Sec title={`หักมาสาย (รวม ${Math.round(st.lateMin || 0)} นาที × ${fmtBaht(hourly)}/ชม.)`} amount={c.dLate} neg>
            {lateDays.length === 0 && <Row l="ไม่มีสายในรอบนี้ (หรือไม่เกินผ่อนผัน)" v="" dim />}
            {lateDays.map((d) => <Row key={d.d} l={thDate(d.d)} v={`สาย ${Math.round(d.lateMin)} นาที = ${fmtBaht(d.lateMin / 60 * hourly)}`} />)}
          </Sec>
          <Sec title={`หักขาดงาน (${st.absent} วัน${monthly ? ` × ${fmtBaht(daily)}` : " — รายวันไม่หัก (ไม่มาไม่ได้ค่าแรงอยู่แล้ว)"})`} amount={c.dAbsent} neg>
            {absentDays.length === 0 && <Row l="ไม่มีขาดงานในรอบนี้" v="" dim />}
            {absentDays.map((d) => <Row key={d.d} l={thDate(d.d)} v={d.leaveH ? `ลา ${d.leaveH} ชม. แต่ไม่ได้เช็คอิน` : (monthly ? "−" + fmtBaht(daily) : "ไม่ได้ค่าแรงวันนี้")} />)}
          </Sec>
          <Sec title={`ลาในรอบนี้ (${st.leaveDays} วัน) · หักลาเกินโควตา/ลาไม่รับค่าแรง ${st.overLeave || 0} วัน`} amount={c.dLeave} neg>
            {leaveDays.length === 0 && <Row l="ไม่มีลาในรอบนี้" v="" dim />}
            {leaveDays.map((d) => <Row key={d.d + (d.lt || "")} l={thDate(d.d)} v={`${leaveLabel(d.lt)}${d.kind === "leave" ? (d.frac < 1 ? ` ${d.frac} วัน` : " เต็มวัน") : ` ${d.leaveH} ชม.`}`} />)}
            {(st.overLeave || 0) > 0 && <Row l={`ส่วนที่ถูกหัก = เกินโควตาปีนี้ที่เกิดในรอบ + ลาไม่รับค่าแรง (${st.overLeave} วัน × ${fmtBaht(daily)})`} v="" dim />}
          </Sec>
          <Sec title="ประกันสังคม 5%" amount={c.dSso} neg>
            <Row l={c.dSso ? `ฐาน ${fmtBaht(Math.min(monthly ? basePay : c.base, 17500))} (เพดาน 17,500) × 5%` : "ไม่ได้ติ๊กประกันสังคม (ตั้งได้ที่ กะ & ตั้งค่า)"} v="" dim />
          </Sec>
          <Sec title="หักเบิกเงินล่วงหน้า" amount={c.dAdvance} neg>
            {(advRows || []).length === 0 && <Row l="ไม่มีเบิกล่วงหน้าค้างหักในรอบนี้" v="" dim />}
            {(advRows || []).map((a) => <Row key={a.id} l={`${a.created_at ? thDate(a.created_at.slice(0, 10)) : ""}${a.reason ? ` · ${a.reason}` : ""}`} v={"−" + fmtBaht(a.amount)} />)}
          </Sec>
          {(c.bonus > 0 || c.otherDeduct > 0) && (
            <Sec title="ปรับมือรอบนี้" amount={null}>
              {c.bonus > 0 && <Row l="โบนัส/เบี้ยเลี้ยง" v={"+" + fmtBaht(c.bonus)} />}
              {c.otherDeduct > 0 && <Row l="หักอื่น ๆ" v={"−" + fmtBaht(c.otherDeduct)} />}
            </Sec>
          )}
          <div style={{ borderTop: "2px solid var(--ink)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14 }}>
            <b>รวมรายได้ {fmtBaht(c.gross)} − รายการหัก {fmtBaht(c.ded)}</b>
            <b style={{ color: "var(--up)" }}>สุทธิ {fmtBaht(c.net)}</b>
          </div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ปิด</button></div>
      </div>
    </div>
  );
}
