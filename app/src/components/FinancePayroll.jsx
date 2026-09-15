import React from "react";
import { loadFinancePayroll, financePayrollRows, payrollTotals, financePayrollCsv, payrollStatus, payrollAmount, PAYROLL_INCOME, PAYROLL_DEDUCTIONS } from "../lib/financePayroll";
import { fmtDocAmount as fmtBaht } from "../lib/format";
import { payPeriod } from "../lib/payroll";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import "./FinancePayroll.css";

export function PayrollReadSlip({ row, period }) {
  const { employee, slip, calc } = row;
  if (!slip || !calc) return null;
  const { from, to } = payPeriod(period);
  const lines = (fields) => fields.map(([key, label]) => <tr key={key}><td>{label}</td><td className="r">{fmtBaht(payrollAmount(calc, key))}</td></tr>);
  return <article className="payslip-print finance-payroll-slip">
    <div className="ps-co-name">AMC AIR</div>
    <div className="ps-title">รายละเอียดเงินเดือน</div>
    <div className="ps-period">รอบ {period} · {from} ถึง {to}</div>
    <div className="ps-emp"><b>{employee.name}</b>{employee.department ? ` · ${employee.department}` : ""} · {slip.pay_type === "daily" ? "รายวัน" : "รายเดือน"}</div>
    <p className="finance-payroll-state">{payrollStatus(slip)} · {slip.status === "paid" ? "ตรวจสถานะการจ่ายเงินจริงที่เมนูเบิกจ่าย" : "ยอดร่างยังเปลี่ยนได้ก่อนอนุมัติ"}</p>
    {row.mismatch && <p role="alert">ยอดสุทธิที่บันทึกไม่ตรงกับรายได้ลบรายการหัก กรุณาให้ HR ตรวจสอบ</p>}
    <table className="ps-tbl"><tbody>
      <tr className="ps-h"><td colSpan={2}>รายได้ (บาท)</td></tr>{lines(PAYROLL_INCOME)}
      <tr className="ps-sub"><td>รวมรายได้</td><td className="r">{fmtBaht(calc.gross)}</td></tr>
      <tr className="ps-h"><td colSpan={2}>รายการหัก (บาท)</td></tr>{lines(PAYROLL_DEDUCTIONS)}
      <tr className="ps-sub"><td>รวมรายการหัก</td><td className="r">{fmtBaht(calc.ded)}</td></tr>
      <tr className="ps-net"><td>{calc.net < 0 ? "ค้างบริษัท" : "รับสุทธิที่บันทึก"}</td><td className="r">{fmtBaht(calc.net)}</td></tr>
    </tbody></table>
    <p className="ps-att">ข้อมูลที่บันทึกในรอบ: มา {Number(slip.present_days) || 0} วัน · ขาด {Number(slip.absent_days) || 0} วัน · ลา {Number(slip.leave_days) || 0} วัน · สาย {Number(slip.late_min) || 0} นาที · OT {calc.otHours} ชั่วโมง</p>
  </article>;
}

export default function FinancePayroll({ loadReport = loadFinancePayroll }) {
  const [period, setPeriod] = React.useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7));
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState("");
  const [revision, reload] = React.useReducer((n) => n + 1, 0);
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [detail, setDetail] = React.useState(null);
  const [printJob, setPrintJob] = React.useState(null);
  const [notice, setNotice] = React.useState("");
  const printWin = React.useRef(null);
  React.useEffect(() => {
    let current = true;
    setData(null); setError(""); setDetail(null);
    loadReport(period).then((result) => { if (current) setData(result); })
      .catch((e) => { if (current) setError(e.message || "โหลดเงินเดือนไม่สำเร็จ"); });
    return () => { current = false; };
  }, [period, revision, loadReport]);
  React.useEffect(() => {
    if (!printJob) return;
    writeAndPrint(printWin.current, "#finance-payroll-print")
      .catch(() => setNotice("พิมพ์ไม่สำเร็จ กรุณาลองใหม่"))
      .finally(() => { printWin.current = null; setPrintJob(null); });
  }, [printJob]);
  const ready = data?.period === period && !error;
  const rows = React.useMemo(() => ready ? financePayrollRows(data) : [], [data, ready]);
  const filtered = rows.filter((r) => (!query.trim() || `${r.employee.name || ""} ${r.employee.department || ""}`.toLocaleLowerCase("th").includes(query.trim().toLocaleLowerCase("th")))
    && (status === "all" || (r.slip?.status || "missing") === status));
  const totals = payrollTotals(filtered);
  const details = filtered.find((r) => r.employee.id === detail);
  function print(rowsToPrint) {
    const saved = rowsToPrint.filter((r) => r.slip);
    if (!ready || !saved.length || printJob) return;
    const win = openPrintWindow();
    if (!win) { setNotice("เบราว์เซอร์บล็อกหน้าพิมพ์ กรุณาอนุญาตป๊อปอัปแล้วกดพิมพ์อีกครั้ง"); return; }
    setNotice(""); printWin.current = win; setPrintJob({ period, rows: saved });
  }
  function download() {
    if (!ready || !filtered.length) return;
    const url = URL.createObjectURL(new Blob([financePayrollCsv(period, filtered)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `payroll-${period}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="adm finance-payroll">
    <div className="adm-head"><div><h1 className="page-title">เงินเดือนและรายงาน HR</h1><p className="page-sub">สำหรับบัญชี · ดูข้อมูลและพิมพ์รายงาน</p></div><span className="job-badge">ดูอย่างเดียว</span></div>
    <div className="card finance-payroll-toolbar">
      <label>รอบเดือน<input className="inp" aria-label="รอบเดือน" type="month" value={period} onChange={(e) => { if (e.target.value) setPeriod(e.target.value); }} /></label>
      <label>ค้นหาพนักงาน<input className="inp" aria-label="ค้นหาพนักงาน" placeholder="ชื่อ / แผนก" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label>สถานะ<select className="inp" aria-label="สถานะเงินเดือน" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">ทุกสถานะ</option><option value="draft">ร่างที่บันทึก</option><option value="paid">อนุมัติส่งเบิกจ่ายแล้ว</option><option value="missing">ยังไม่บันทึกรอบ</option></select></label>
      <button className="btn-ghost" onClick={() => { setData(null); reload(); }}>โหลดข้อมูลล่าสุด</button>
      <button className="btn-ghost" disabled={!ready || !filtered.length} onClick={download}>ส่งออก CSV</button>
      <button className="btn-primary" disabled={!ready || !totals.count || !!printJob} onClick={() => print(filtered)}>พิมพ์สลิปตามตัวกรอง</button>
    </div>
    <p className="sec-sub">ฐานค่าจ้างแสดงอัตราปัจจุบัน ส่วนยอดรายรับและรายการหักแสดงตามรอบที่ HR บันทึกไว้ หากยังไม่บันทึกรอบจะแสดงว่ายังไม่มีข้อมูล</p>
    {notice && <div className="card" role="status">{notice}</div>}
    {error ? <div className="card" role="alert">โหลดข้อมูลไม่สำเร็จ: {error} <button className="btn-ghost" onClick={() => reload()}>ลองใหม่</button></div> : !ready ? <div className="empty" role="status">กำลังโหลดเงินเดือน…</div> : <>
      <div className="finance-payroll-totals">
        {[["พนักงานที่มีข้อมูลรอบนี้", `${totals.count} / ${filtered.length} คน`], ["รวมรายได้", fmtBaht(totals.gross)], ["รวมรายการหัก", fmtBaht(totals.ded)], ["สุทธิที่บันทึก", fmtBaht(totals.net)]].map(([label, value]) => <div className="card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <p className="sec-sub">ยอดรวมตามตัวกรอง · รวมเฉพาะรายการที่บันทึกแล้ว · หน่วยเงิน: บาท</p>
      {!filtered.length ? <div className="empty">ไม่พบพนักงานตามตัวกรอง</div> : <div className="finance-payroll-list">
        {filtered.map((r) => <article className="card finance-payroll-person" key={r.employee.id}>
          <div><h2>{r.employee.name || "ไม่ระบุชื่อ"}</h2><span className="sec-sub">{r.employee.department || ""}{r.employee.active === false ? " · พ้นสภาพ (ประวัติย้อนหลัง)" : ""}</span><div className="finance-payroll-state">{payrollStatus(r.slip)}</div></div>
          <dl><div><dt>ฐานค่าจ้างปัจจุบัน</dt><dd>{r.employee.has_pay_rate ? `${fmtBaht(r.employee.base_pay)} / ${r.employee.pay_type === "daily" ? "วัน" : "เดือน"}` : "ยังไม่ตั้งค่าจ้าง"}</dd></div>
            {[["รายได้ในรอบ", "gross"], ["รายการหัก", "ded"], ["รับสุทธิ", "net"]].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{r.calc ? fmtBaht(r.calc[key]) : "—"}</dd></div>)}</dl>
          {r.mismatch && <p role="alert">ยอดรอบนี้ต้องตรวจสอบกับ HR</p>}
          {r.slip && <div className="finance-payroll-actions"><button className="btn-ghost" onClick={() => setDetail(detail === r.employee.id ? null : r.employee.id)} aria-expanded={detail === r.employee.id}>ดูรายรับ / รายการหัก</button><button className="btn-ghost" disabled={!!printJob} onClick={() => print([r])}>พิมพ์สลิป</button></div>}
          {details?.employee.id === r.employee.id && <PayrollReadSlip row={r} period={period} />}
        </article>)}
      </div>}
    </>}
    {printJob && <div className="print-area" id="finance-payroll-print">{printJob.rows.map((r) => <PayrollReadSlip key={r.employee.id} row={r} period={printJob.period} />)}</div>}
  </div>;
}
