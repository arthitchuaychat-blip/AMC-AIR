import React from "react";
import { listAttendance, listLeaves, decideLeave, updateLeave, deleteLeave, deleteAttendance, listHrStaff, updateHrProfile, getHrSettings, saveHrSettings, listHolidays, saveHoliday, deleteHoliday, getLeaveQuotas, saveLeaveQuota, listPayslips, savePayslip, setPayslipPaid, upsertPayrollCashEntry, removePayrollCashEntry, unsettleAdvances, listJobOrders, listTeams, getCompanies, adminSaveAttendance, listAdvances, decideAdvance, updateAdvance, deleteAdvance, markAdvancesPaid, uploadSignature, getProfile } from "../lib/api";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import { confirmDialog } from "./ConfirmDialog";
import { DEFAULT_HR_SETTINGS, dayStat, fmtMin, fmtTime, isWorkday, WORK_PATTERNS, patternLabel, leaveLabel, leaveDays, LEAVE_TYPES, hrYmd, hrParseYmd, todayYmd } from "../lib/hr";
import { payPeriod, periodStats, computePayslip } from "../lib/payroll";
import { fmtBaht } from "../lib/format";
import { UIcon } from "../icons";

const TABS = [["today", "วันนี้"], ["leaves", "อนุมัติลา"], ["advances", "เบิกล่วงหน้า"], ["report", "รายงาน/สถิติ"], ["payroll", "เงินเดือน"], ["perf", "ประสิทธิผล"], ["staff", "กะ & ตั้งค่า"]];
const thDate = (s) => hrParseYmd(s).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
const monthRange = (ym) => { const [y, m] = ym.split("-").map(Number); const last = new Date(y, m, 0).getDate(); const p = (n) => String(n).padStart(2, "0"); return [`${ym}-01`, `${ym}-${p(last)}`, last]; };

export default function HR({ role }) {
  const canManage = role === "admin" || role === "exec" || role === "hr"; // ธุรการ/ผู้บริหาร/ฝ่ายบุคคล แก้ไข/ลบได้
  const [selfId, setSelfId] = React.useState(null);       // uid ของผู้ใช้ปัจจุบัน — ฝ่ายบุคคลห้ามแก้เวลาของตัวเอง
  React.useEffect(() => { getProfile().then((p) => setSelfId(p?.id || null)).catch(() => {}); }, []);
  const lockSelfId = role === "hr" ? selfId : null;        // admin/exec แก้ได้ทุกคนรวมถึงแถวของ HR เอง
  const [tab, setTab] = React.useState("today");
  const [settings, setSettings] = React.useState(DEFAULT_HR_SETTINGS);
  const [staff, setStaff] = React.useState([]);
  const [holidays, setHolidays] = React.useState([]);
  const [toast, setToast] = React.useState(null);
  const holSet = React.useMemo(() => new Set(holidays.map((h) => h.day)), [holidays]);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  async function loadBase() {
    try { const [s, st, hol] = await Promise.all([getHrSettings(), listHrStaff(), listHolidays()]); setSettings(s || DEFAULT_HR_SETTINGS); setStaff(st); setHolidays(hol); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
  }
  React.useEffect(() => { loadBase(); }, []);

  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">บุคคล (HR) <span className="page-title-en">Human Resources</span></h1>
        <p className="page-sub">เข้างาน · ลา · สถิติพนักงาน · เวลาทำงาน {settings.start}–{settings.end} น.</p></div></div>
      <div className="cat-filter">
        {TABS.map(([v, l]) => <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
          style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>)}
      </div>

      {tab === "today" && <TodayTab staff={staff} settings={settings} holSet={holSet} canManage={canManage} lockSelfId={lockSelfId} flash={flash} />}
      {tab === "leaves" && <LeavesTab staff={staff} holSet={holSet} canManage={canManage} flash={flash} />}
      {tab === "advances" && <AdvancesTab canManage={canManage} flash={flash} />}
      {tab === "report" && <ReportTab staff={staff} settings={settings} holSet={holSet} flash={flash} />}
      {tab === "payroll" && <PayrollTab staff={staff} settings={settings} holSet={holSet} flash={flash} />}
      {tab === "perf" && <PerfTab staff={staff} settings={settings} holSet={holSet} flash={flash} />}
      {tab === "staff" && <StaffTab staff={staff} settings={settings} holidays={holidays} onReload={loadBase} flash={flash} />}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// ---------- TODAY ----------
function TodayTab({ staff, settings, holSet, canManage, lockSelfId, flash }) {
  const [att, setAtt] = React.useState([]);
  const [onLeave, setOnLeave] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState(null); // { p, a } row being corrected
  const day = todayYmd();
  async function load() {
    try {
      const [a, lv] = await Promise.all([listAttendance(day, day), listLeaves("approved")]);
      setAtt(a);
      const m = {}; lv.forEach((l) => { if (l.start_date <= day && l.end_date >= day) m[l.user_id] = l.type; }); setOnLeave(m);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  async function delAtt(p) {
    if (!await confirmDialog(`ลบเวลาเข้า-ออกของ ${p.name || p.email} วันนี้?\n(กลับเป็น “ยังไม่เข้า”)`)) return;
    try { await deleteAttendance(p.id, day); flash("ลบเวลาแล้ว"); load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  const attBy = Object.fromEntries(att.map((a) => [a.user_id, a]));
  const rows = staff.map((p) => {
    const a = attBy[p.id], s = a ? dayStat(a, settings) : null;
    const work = isWorkday(day, p.work_pattern || "mon_sat", p.sat_group, holSet);
    let status = "off";
    if (onLeave[p.id]) status = "leave";
    else if (a?.check_in_at) status = a?.check_out_at ? "out" : (s.isLate ? "late" : "in");
    else if (work) status = "absent";
    return { p, a, s, status };
  });
  const order = { in: 0, late: 1, out: 2, absent: 3, leave: 4, off: 5 };
  rows.sort((x, y) => order[x.status] - order[y.status] || (x.p.name || "").localeCompare(y.p.name || "", "th"));
  const ST = { in: { t: "เข้างานแล้ว", c: "b-green" }, late: { t: "มาสาย", c: "b-amber" }, out: { t: "ออกงานแล้ว", c: "b-cyan" }, absent: { t: "ยังไม่เข้า/ขาด", c: "b-red" }, leave: { t: "ลา", c: "b-blue" }, off: { t: "วันหยุด", c: "b-grey" } };
  if (loading) return <div className="empty">กำลังโหลด…</div>;
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">{thDate(day)}</div>
        <div className="sec-sub">เข้าแล้ว {rows.filter((r) => r.status === "in" || r.status === "late" || r.status === "out").length} · ออกแล้ว {rows.filter((r) => r.status === "out").length} · ยังไม่เข้า {rows.filter((r) => r.status === "absent").length} · ลา {rows.filter((r) => r.status === "leave").length}</div></div></div>
      <div className="set-list">
        {rows.map(({ p, a, s, status }) => { const b = ST[status];
          const rowManage = canManage && p.id !== lockSelfId;   // ฝ่ายบุคคลแก้เวลาได้ทุกคน ยกเว้นของตัวเอง
          return (
          <div className="hr-today-row" key={p.id}>
            <div className="hr-name"><b>{p.name || p.email}</b><span className="jo-dim">{p.department || "-"}</span></div>
            <div className="hr-times">
              <span>เข้า <b>{fmtTime(a?.check_in_at)}</b>{s?.isLate && <span className="att-tag late sm">+{fmtMin(s.lateMin)}</span>}</span>
              <span>ออก <b>{fmtTime(a?.check_out_at)}</b>{s?.otHours > 0 && <span className="att-tag ot sm">OT {s.otHours} ชม.</span>}</span>
            </div>
            <span className={"job-badge " + b.c}>{status === "leave" ? leaveLabel(onLeave[p.id]) : b.t}</span>
            {rowManage && <button className="btn-ghost sm" title="แก้ไขเวลาเข้า-ออก" onClick={() => setEdit({ p, a })}><UIcon name="edit" size={13} /></button>}
            {rowManage && a && <button className="btn-ghost sm danger" title="ลบเวลาเข้า-ออก" onClick={() => delAtt(p)}><UIcon name="trash" size={13} /></button>}
            {canManage && !rowManage && <span className="jo-dim" title="ฝ่ายบุคคลแก้เวลาของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารแก้ให้" style={{ fontSize: 11 }}>🔒 ของตัวเอง</span>}
          </div>
        ); })}
      </div>
      {edit && <AttEditModal day={day} row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} flash={flash} />}
    </div>
  );
}

// HR/admin manual correction of a person's check-in/out for the day
function AttEditModal({ day, row, onClose, onSaved, flash }) {
  const toHM = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const [ci, setCi] = React.useState(toHM(row.a?.check_in_at));
  const [co, setCo] = React.useState(toHM(row.a?.check_out_at));
  const [busy, setBusy] = React.useState(false);
  const toIso = (hm) => hm ? new Date(`${day}T${hm}:00`).toISOString() : null;
  async function save() {
    setBusy(true);
    try { await adminSaveAttendance(row.p.id, day, toIso(ci), toIso(co)); flash("บันทึกเวลาแล้ว ✓"); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 380 }}>
        <div className="modal-head"><div className="modal-title">แก้ไขเวลา · {row.p.name || row.p.email}<span>{thDate(day)}</span></div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>เวลาเข้า</span><input className="inp" type="time" value={ci} onChange={(e) => setCi(e.target.value)} /></label>
            <label className="fld"><span>เวลาออก</span><input className="inp" type="time" value={co} onChange={(e) => setCo(e.target.value)} /></label>
          </div>
          <p className="page-sub" style={{ marginTop: 6 }}>เว้นว่าง = ลบเวลานั้น (เช่น เคลียร์ให้เป็นยังไม่เข้า) · สาย/OT คำนวณใหม่อัตโนมัติ</p>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>บันทึก</button></div>
      </div>
    </div>
  );
}

// ---------- LEAVES ----------
function LeavesTab({ staff, holSet, canManage, flash }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState(null); // leave being edited
  async function load() { try { setList(await listLeaves()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); } setLoading(false); }
  React.useEffect(() => { load(); }, []);
  async function decide(l, status) {
    const lbl = { approved: "อนุมัติ", rejected: "ไม่อนุมัติ", pending: "คืนเป็นรออนุมัติ" }[status];
    if (!await confirmDialog(`${lbl}ใบลาของ ${l.name}?`)) return;
    try { await decideLeave(l.id, status); flash(lbl + "แล้ว"); load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(l) {
    if (!await confirmDialog(`ลบใบลาของ ${l.name}?\n${leaveLabel(l.type)} · ${thDate(l.start_date)}`)) return;
    try { await deleteLeave(l.id); flash("ลบใบลาแล้ว"); load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  const B = { pending: { t: "รออนุมัติ", c: "b-amber" }, approved: { t: "อนุมัติ", c: "b-green" }, rejected: { t: "ไม่อนุมัติ", c: "b-red" } };
  if (loading) return <div className="empty">กำลังโหลด…</div>;
  const pending = list.filter((l) => l.status === "pending");
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">ใบลา</div><div className="sec-sub">รออนุมัติ {pending.length} รายการ</div></div></div>
      <div className="set-list">
        {list.length === 0 && <div className="empty sm">ยังไม่มีใบลา</div>}
        {list.map((l) => { const b = B[l.status]; return (
          <div className="hr-leave-row" key={l.id}>
            <div><b>{l.name}</b> <span className="jo-dim">{l.department}</span><br />
              {leaveLabel(l.type)} · {thDate(l.start_date)}{l.end_date !== l.start_date ? ` – ${thDate(l.end_date)}` : ""} <span className="att-days">{l.days} วัน</span>
              {l.reason && <div className="jo-dim">เหตุผล: {l.reason}</div>}</div>
            <div className="hr-leave-act">
              <span className={"job-badge " + b.c}>{b.t}</span>
              {l.status !== "approved" && <button className="btn-primary sm ok" onClick={() => decide(l, "approved")}>อนุมัติ</button>}
              {l.status !== "rejected" && <button className="btn-ghost sm" onClick={() => decide(l, "rejected")}>ไม่อนุมัติ</button>}
              {l.status !== "pending" && <button className="btn-ghost sm" onClick={() => decide(l, "pending")}>คืนรออนุมัติ</button>}
              {canManage && <button className="btn-ghost sm" title="แก้ไขใบลา" onClick={() => setEdit(l)}><UIcon name="edit" size={13} /></button>}
              {canManage && <button className="btn-ghost sm danger" title="ลบใบลา" onClick={() => del(l)}><UIcon name="trash" size={13} /></button>}
            </div>
          </div>
        ); })}
      </div>
      {edit && <LeaveEditModal leave={edit} staff={staff} holSet={holSet} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} flash={flash} />}
    </div>
  );
}

// HR/admin edit a leave request (type / dates / reason; days recomputed from the person's work pattern)
function LeaveEditModal({ leave, staff, holSet, onClose, onSaved, flash }) {
  const [type, setType] = React.useState(leave.type);
  const [start, setStart] = React.useState(leave.start_date);
  const [end, setEnd] = React.useState(leave.end_date);
  const [reason, setReason] = React.useState(leave.reason || "");
  const [busy, setBusy] = React.useState(false);
  const person = staff.find((p) => p.id === leave.user_id);
  const days = (start && end && end >= start) ? leaveDays(start, end, person?.work_pattern || "mon_sat", person?.sat_group, holSet) : 1;
  async function save() {
    if (!start || !end || end < start) { flash("ช่วงวันที่ไม่ถูกต้อง", true); return; }
    setBusy(true);
    try { await updateLeave(leave.id, { type, start_date: start, end_date: end, days, reason }); flash("บันทึกใบลาแล้ว ✓"); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-head"><div className="modal-title">แก้ไขใบลา · {leave.name}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>ประเภทการลา</span>
            <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>{LEAVE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
          <div className="fld-row" style={{ marginTop: 8 }}>
            <label className="fld"><span>วันเริ่ม</span><input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label className="fld"><span>วันสิ้นสุด</span><input className="inp" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
          </div>
          <label className="fld" style={{ marginTop: 8 }}><span>เหตุผล</span><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <p className="page-sub" style={{ marginTop: 6 }}>รวม <b>{days}</b> วันทำงาน (คำนวณจากกะของพนักงาน · ไม่นับวันหยุด)</p>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>บันทึก</button></div>
      </div>
    </div>
  );
}

// ---------- CASH ADVANCES (เบิกเงินล่วงหน้า) ----------
function AdvancesTab({ canManage, flash }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState(null); // advance being edited
  async function load() { try { setList(await listAdvances()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); } setLoading(false); }
  React.useEffect(() => { load(); }, []);
  async function decide(a, status) {
    const lbl = { approved: "อนุมัติ", rejected: "ไม่อนุมัติ", pending: "คืนเป็นรออนุมัติ" }[status];
    if (!await confirmDialog(`${lbl}คำขอเบิก ${fmtBaht(a.amount)} ของ ${a.name}?`)) return;
    try { await decideAdvance(a.id, status); flash(lbl + "แล้ว"); load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(a) {
    if (!await confirmDialog(`ลบคำขอเบิก ${fmtBaht(a.amount)} ของ ${a.name}?`)) return;
    try { await deleteAdvance(a.id); flash("ลบคำขอแล้ว"); load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  const B = { pending: { t: "รออนุมัติ", c: "b-amber" }, approved: { t: "อนุมัติ · รอหัก", c: "b-blue" }, rejected: { t: "ไม่อนุมัติ", c: "b-red" }, paid: { t: "หักแล้ว", c: "b-green" } };
  if (loading) return <div className="empty">กำลังโหลด…</div>;
  const pending = list.filter((a) => a.status === "pending");
  const approvedSum = list.filter((a) => a.status === "approved").reduce((s, a) => s + (Number(a.amount) || 0), 0);
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">เบิกเงินล่วงหน้า</div>
        <div className="sec-sub">รออนุมัติ {pending.length} รายการ · อนุมัติแล้วรอหักในรอบถัดไป {fmtBaht(approvedSum)}</div></div></div>
      <div className="set-list">
        {list.length === 0 && <div className="empty sm">ยังไม่มีคำขอเบิก</div>}
        {list.map((a) => { const b = B[a.status] || B.pending; return (
          <div className="hr-leave-row" key={a.id}>
            <div><b>{a.name}</b> <span className="jo-dim">{a.department}</span><br />
              <b>{fmtBaht(a.amount)}</b> · {thDate(a.request_date)}
              {a.reason && <div className="jo-dim">เหตุผล: {a.reason}</div>}
              {a.status === "paid" && a.period && <div className="jo-dim">หักในรอบ {a.period}</div>}</div>
            <div className="hr-leave-act">
              <span className={"job-badge " + b.c}>{b.t}</span>
              {a.status !== "paid" && a.status !== "approved" && <button className="btn-primary sm ok" onClick={() => decide(a, "approved")}>อนุมัติ</button>}
              {a.status !== "paid" && a.status !== "rejected" && <button className="btn-ghost sm" onClick={() => decide(a, "rejected")}>ไม่อนุมัติ</button>}
              {a.status !== "paid" && a.status !== "pending" && <button className="btn-ghost sm" onClick={() => decide(a, "pending")}>คืนรออนุมัติ</button>}
              {canManage && a.status !== "paid" && <button className="btn-ghost sm" title="แก้ไขคำขอ" onClick={() => setEdit(a)}><UIcon name="edit" size={13} /></button>}
              {canManage && a.status !== "paid" && <button className="btn-ghost sm danger" title="ลบคำขอ" onClick={() => del(a)}><UIcon name="trash" size={13} /></button>}
            </div>
          </div>
        ); })}
      </div>
      <p className="page-sub" style={{ marginTop: 8 }}>* ยอดที่ “อนุมัติ” แล้วจะถูกหักอัตโนมัติในรอบเงินเดือนถัดไป แล้วเปลี่ยนเป็น “หักแล้ว” เมื่อกดทำจ่ายทั้งรอบ</p>
      {edit && <AdvanceEditModal adv={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} flash={flash} />}
    </div>
  );
}

// HR/admin edit a cash-advance request (amount / date / reason)
function AdvanceEditModal({ adv, onClose, onSaved, flash }) {
  const [amount, setAmount] = React.useState(adv.amount);
  const [date, setDate] = React.useState(adv.request_date);
  const [reason, setReason] = React.useState(adv.reason || "");
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!(Number(amount) > 0)) { flash("จำนวนเงินไม่ถูกต้อง", true); return; }
    setBusy(true);
    try { await updateAdvance(adv.id, { amount, request_date: date, reason }); flash("บันทึกคำขอแล้ว ✓"); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 400 }}>
        <div className="modal-head"><div className="modal-title">แก้ไขคำขอเบิก · {adv.name}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>จำนวนเงิน (บาท)</span><input className="inp" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="fld"><span>วันที่ขอ</span><input className="inp" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <label className="fld" style={{ marginTop: 8 }}><span>เหตุผล</span><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>บันทึก</button></div>
      </div>
    </div>
  );
}

// ---------- REPORT ----------
function ReportTab({ staff, settings, holSet, flash }) {
  const now = new Date();
  const [ym, setYm] = React.useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [rows, setRows] = React.useState(null);
  const [raw, setRaw] = React.useState(null); // { attByUserDay, leaveDaySet, from, calcTo }
  const [detail, setDetail] = React.useState(null); // staff row clicked
  const [loading, setLoading] = React.useState(false);
  async function run() {
    setLoading(true);
    try {
      const [from, to] = monthRange(ym);
      const today = todayYmd();
      const calcTo = to < today ? to : today;     // don't count future days as absent
      const [att, leaves] = await Promise.all([listAttendance(from, calcTo), listLeaves("approved")]);
      const attByUserDay = {}; att.forEach((a) => { (attByUserDay[a.user_id] = attByUserDay[a.user_id] || {})[a.work_date] = a; });
      const leaveDaySet = {}; leaves.forEach((l) => { for (let d = hrParseYmd(l.start_date); d <= hrParseYmd(l.end_date); d.setDate(d.getDate() + 1)) { const k = hrYmd(d); if (k >= from && k <= calcTo) (leaveDaySet[l.user_id] = leaveDaySet[l.user_id] || {})[k] = l.type; } });
      const result = staff.map((p) => {
        let present = 0, lateCnt = 0, lateMin = 0, otMin = 0, otHours = 0, absent = 0, workdays = 0, leaveCnt = 0;
        for (let d = hrParseYmd(from); d <= hrParseYmd(calcTo); d.setDate(d.getDate() + 1)) {
          const k = hrYmd(d);
          const onLeave = leaveDaySet[p.id]?.[k];
          if (onLeave) { leaveCnt++; continue; }
          if (!isWorkday(k, p.work_pattern || "mon_sat", p.sat_group, holSet)) continue;
          workdays++;
          const a = attByUserDay[p.id]?.[k];
          if (a?.check_in_at) { present++; const s = dayStat(a, settings); if (s.isLate) { lateCnt++; lateMin += s.lateMin; } otMin += s.otMin; otHours += s.otHours; }
          else absent++;
        }
        return { p, present, lateCnt, lateMin, otMin, otHours, absent, workdays, leaveCnt };
      });
      result.sort((a, b) => b.absent - a.absent || b.lateCnt - a.lateCnt); // worst first (for review)
      setRows(result); setRaw({ attByUserDay, leaveDaySet, from, calcTo });
    } catch (e) { flash("คำนวณไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { run(); }, [ym]);

  function exportCsv() {
    if (!rows) return;
    const head = ["ชื่อ", "แผนก", "วันทำงาน", "มา", "ขาด", "ลา", "สาย(ครั้ง)", "สายรวม(นาที)", "OT(ชม.)"];
    const lines = rows.map((r) => [r.p.name, r.p.department || "", r.workdays, r.present, r.absent, r.leaveCnt, r.lateCnt, Math.round(r.lateMin), r.otHours || 0]);
    const csv = "﻿" + [head, ...lines].map((a) => a.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `hr-${ym}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // build per-day detail for one person (for the drill-down modal)
  function personDays(p) {
    if (!raw) return [];
    const out = [];
    for (let d = hrParseYmd(raw.calcTo); d >= hrParseYmd(raw.from); d.setDate(d.getDate() - 1)) {
      const k = hrYmd(d);
      const onLeave = raw.leaveDaySet[p.id]?.[k];
      const work = isWorkday(k, p.work_pattern || "mon_sat", p.sat_group, holSet);
      if (!onLeave && !work) continue; // skip plain days off
      const a = raw.attByUserDay[p.id]?.[k];
      let kind = "off", s = null;
      if (onLeave) kind = "leave";
      else if (a?.check_in_at) { s = dayStat(a, settings); kind = s.isLate ? "late" : "present"; }
      else kind = "absent";
      out.push({ k, kind, leaveType: onLeave, a, s });
    }
    return out;
  }

  return (
    <div className="card">
      <div className="sec-head">
        <div><div className="sec-title">สถิติรายเดือน <span className="sec-sub" style={{ fontWeight: 400 }}>(นับถึงวันนี้)</span></div><div className="sec-sub">กดที่ชื่อเพื่อดูรายวัน · เรียงคนขาด/สายมากสุดขึ้นก่อน</div></div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="inp" type="month" value={ym} onChange={(e) => setYm(e.target.value)} style={{ width: 160 }} />
          <button className="btn-ghost sm" onClick={exportCsv} disabled={!rows}>ส่งออก CSV</button>
        </div>
      </div>
      {loading || !rows ? <div className="empty">กำลังคำนวณ…</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="hr-table">
            <thead><tr><th style={{ textAlign: "left" }}>ชื่อ</th><th>แผนก</th><th>วันทำงาน</th><th>มา</th><th>ขาด</th><th>ลา</th><th>สาย</th><th>สายรวม</th><th>OT</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id} className="hr-row-click" onClick={() => setDetail(r)}>
                  <td style={{ textAlign: "left" }}><b>{r.p.name || r.p.email}</b> <span className="hr-row-go">ดู ›</span></td>
                  <td>{r.p.department || "-"}</td>
                  <td>{r.workdays}</td>
                  <td className="hr-ok">{r.present}</td>
                  <td className={r.absent ? "hr-bad" : ""}>{r.absent}</td>
                  <td>{r.leaveCnt}</td>
                  <td className={r.lateCnt ? "hr-warn" : ""}>{r.lateCnt}</td>
                  <td>{fmtMin(r.lateMin)}</td>
                  <td>{r.otHours ? r.otHours.toFixed(1) + " ชม." : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && <PersonDetail row={detail} days={personDays(detail.p)} onClose={() => setDetail(null)} />}
    </div>
  );
}

function PersonDetail({ row, days, onClose }) {
  const KIND = {
    present: { t: "มา", c: "b-green" }, late: { t: "มาสาย", c: "b-amber" },
    absent: { t: "ขาด", c: "b-red" }, leave: { t: "ลา", c: "b-blue" },
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{row.p.name || row.p.email}<span>{row.p.department || ""}</span></div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="hr-detail-sum">
            <span className="hr-ok">มา {row.present}</span><span className="hr-bad">ขาด {row.absent}</span>
            <span>ลา {row.leaveCnt}</span><span className="hr-warn">สาย {row.lateCnt}</span>
            <span>OT {(row.otHours || 0).toFixed(1)} ชม.</span>
          </div>
          <div className="set-list">
            {days.length === 0 && <div className="empty sm">ไม่มีข้อมูลในเดือนนี้</div>}
            {days.map((d) => { const b = KIND[d.kind] || KIND.absent; return (
              <div className="hr-detail-row" key={d.k}>
                <span className="hr-detail-d">{thDate(d.k)}</span>
                <span className="hr-detail-mid">
                  {d.kind === "leave" ? leaveLabel(d.leaveType)
                    : d.a?.check_in_at ? <>เข้า <b>{fmtTime(d.a.check_in_at)}</b> · ออก <b>{fmtTime(d.a.check_out_at)}</b>
                      {d.s?.isLate && <span className="att-tag late sm">สาย {fmtMin(d.s.lateMin)}</span>}
                      {d.s?.otHours > 0 && <span className="att-tag ot sm">OT {d.s.otHours} ชม.</span>}</>
                    : "—"}
                </span>
                <span className={"job-badge " + b.c}>{d.kind === "leave" ? leaveLabel(d.leaveType) : b.t}</span>
              </div>
            ); })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- STAFF SCHEDULES + SETTINGS ----------
// ---------- PERFORMANCE (ประสิทธิผล) ----------
function PerfTab({ staff, settings, holSet, flash }) {
  const pad = (n) => String(n).padStart(2, "0");
  const [ym, setYm] = React.useState(() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
  const [rows, setRows] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  async function load() {
    setLoading(true);
    try {
      const [from, to] = monthRange(ym);
      const today = todayYmd(); const calcTo = to < today ? to : today;
      const [att, leaves, jobs, teams] = await Promise.all([listAttendance(from, calcTo), listLeaves("approved"), listJobOrders(), listTeams()]);
      const attByUserDay = {}; att.forEach((a) => { (attByUserDay[a.user_id] = attByUserDay[a.user_id] || {})[a.work_date] = a; });
      const leaveDaySet = {}; leaves.forEach((l) => { for (let d = hrParseYmd(l.start_date); d <= hrParseYmd(l.end_date); d.setDate(d.getDate() + 1)) { const k = hrYmd(d); if (k >= from && k <= calcTo) (leaveDaySet[l.user_id] = leaveDaySet[l.user_id] || {})[k] = l.type; } });
      const teamName = Object.fromEntries(teams.map((t) => [t.id, (t.name || "").replace("Team ", "")]));
      const jm = {};
      jobs.forEach((j) => { if (!j.assigned_team) return; const d = j.scheduled_at ? hrYmd(new Date(j.scheduled_at)) : null; if (!d || d < from || d > to) return; const m = jm[j.assigned_team] || (jm[j.assigned_team] = { done: 0, ratingSum: 0, ratingN: 0, claims: 0, resched: 0 }); if (j.status === "done") m.done++; if (j.rating > 0) { m.ratingSum += j.rating; m.ratingN++; } if (j.is_claim) m.claims++; if (j.status === "reschedule") m.resched++; });
      const result = staff.map((p) => {
        const st = periodStats(p, attByUserDay, leaveDaySet, from, calcTo, holSet, settings);
        const onTime = st.workdays ? Math.round((st.present - st.lateCnt) / st.workdays * 100) : null;
        const m = jm[p.team] || { done: 0, ratingSum: 0, ratingN: 0, claims: 0, resched: 0 };
        const avgRating = m.ratingN ? (m.ratingSum / m.ratingN) : null;
        const otHours = st.otHours || 0;
        let score = 0, wsum = 0;
        if (onTime != null) { score += onTime * 0.5; wsum += 0.5; }
        if (st.workdays) { score += (st.present / st.workdays * 100) * 0.2; wsum += 0.2; }
        if (avgRating != null) { score += (avgRating / 5 * 100) * 0.3; wsum += 0.3; }
        let comp = wsum ? Math.round(score / wsum) : null;
        if (comp != null) comp = Math.max(0, comp - m.claims * 5);
        return { p, st, onTime, otHours, m, avgRating, comp, team: teamName[p.team] || "—" };
      });
      result.sort((a, b) => (b.comp ?? -1) - (a.comp ?? -1));
      setRows(result);
    } catch (e) { flash("คำนวณไม่สำเร็จ: " + (e.message || e), true); setRows([]); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [ym]);
  const scoreColor = (s) => s == null ? "var(--ink-3)" : s >= 80 ? "var(--up)" : s >= 60 ? "#d97706" : "var(--down)";
  return (
    <div className="card">
      <div className="sec-head">
        <div><div className="sec-title">ประสิทธิผลพนักงาน · {ym}</div><div className="sec-sub">ตรงเวลา + งานของทีม (เสร็จ/คะแนน/เคลม) + OT · เรียงคะแนนสูงสุดก่อน</div></div>
        <input className="inp" type="month" value={ym} onChange={(e) => setYm(e.target.value)} style={{ width: 160 }} />
      </div>
      {loading ? <div className="empty">กำลังคำนวณ…</div> : !rows.length ? <div className="empty">ไม่มีข้อมูล</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="hr-table">
            <thead><tr><th style={{ textAlign: "left" }}>พนักงาน</th><th>ทีม</th><th>มา/ขาด/ลา</th><th>สาย</th><th>ตรงเวลา</th><th>OT(ชม.)</th><th>งานเสร็จ(ทีม)</th><th>คะแนนงาน</th><th>เคลม</th><th>เลื่อนนัด</th><th>คะแนนรวม</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id}>
                  <td style={{ textAlign: "left" }}><b>{r.p.name || r.p.email}</b></td>
                  <td>{r.team}</td>
                  <td>{r.st.present}/{r.st.absent}/{r.st.leaveDays}</td>
                  <td className={r.st.lateCnt ? "hr-warn" : ""}>{r.st.lateCnt || "—"}</td>
                  <td>{r.onTime != null ? r.onTime + "%" : "—"}</td>
                  <td className="hr-ok">{r.otHours ? r.otHours.toFixed(1) : "—"}</td>
                  <td>{r.m.done || "—"}</td>
                  <td>{r.avgRating != null ? `★ ${r.avgRating.toFixed(1)}` : "—"}</td>
                  <td className={r.m.claims ? "hr-bad" : ""}>{r.m.claims || "—"}</td>
                  <td className={r.m.resched ? "hr-warn" : ""}>{r.m.resched || "—"}</td>
                  <td style={{ fontWeight: 800, color: scoreColor(r.comp) }}>{r.comp != null ? r.comp : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="page-sub" style={{ marginTop: 10 }}>* งาน/คะแนน/เคลม นับจากงานของ “ทีม” ที่พนักงานสังกัด (งานผูกกับทีม ไม่ใช่รายคน) · คะแนนรวม = ตรงเวลา 50% + มาทำงาน 20% + คะแนนงาน 30% − เคลม×5</p>
    </div>
  );
}

// ---------- PAYROLL (เงินเดือน) ----------
function PayrollTab({ staff, settings, holSet, flash }) {
  const pad = (n) => String(n).padStart(2, "0");
  const [ym, setYm] = React.useState(() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
  const { from, to } = payPeriod(ym);
  const [rows, setRows] = React.useState(null);
  const [paidStatus, setPaidStatus] = React.useState("draft");
  const [adj, setAdj] = React.useState({});     // user_id → { bonus, other_deduct }
  const [advByUser, setAdvByUser] = React.useState({});   // user_id → approved-unsettled advance total
  const [advIdsByUser, setAdvIdsByUser] = React.useState({}); // user_id → [advance ids] to settle on pay
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [company, setCompany] = React.useState({});
  const [printSlip, setPrintSlip] = React.useState(null); // { row, calc } for the off-screen payslip
  const printWin = React.useRef(null);
  const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const payDate = `${ym}-${pad(lastDay)}`;
  React.useEffect(() => { getCompanies().then((co) => setCompany((co?.vat && Object.keys(co.vat).length ? co.vat : co?.novat) || {})).catch(() => {}); }, []);
  React.useEffect(() => { if (!printSlip) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintSlip(null); }, 150); return () => clearTimeout(t); }, [printSlip]);

  async function load() {
    setLoading(true);
    try {
      const [att, leaves, slips, advs] = await Promise.all([listAttendance(from, to), listLeaves("approved"), listPayslips(ym), listAdvances("approved")]);
      // approved advances not yet settled (period not set) → deduct in this run
      const advSum = {}, advIds = {};
      advs.filter((a) => !a.period).forEach((a) => { advSum[a.user_id] = (advSum[a.user_id] || 0) + (Number(a.amount) || 0); (advIds[a.user_id] = advIds[a.user_id] || []).push(a.id); });
      setAdvByUser(advSum); setAdvIdsByUser(advIds);
      const attByUserDay = {}; att.forEach((a) => { (attByUserDay[a.user_id] = attByUserDay[a.user_id] || {})[a.work_date] = a; });
      const leaveDaySet = {}, yearUsed = {}; const yr = ym.slice(0, 4);
      leaves.forEach((l) => {
        for (let d = hrParseYmd(l.start_date); d <= hrParseYmd(l.end_date); d.setDate(d.getDate() + 1)) { const k = hrYmd(d); if (k >= from && k <= to) (leaveDaySet[l.user_id] = leaveDaySet[l.user_id] || {})[k] = l.type; }
        if (String(l.start_date).startsWith(yr)) { (yearUsed[l.user_id] = yearUsed[l.user_id] || {}); yearUsed[l.user_id][l.type] = (yearUsed[l.user_id][l.type] || 0) + Number(l.days || 0); }
      });
      const quota = settings.quota || DEFAULT_HR_SETTINGS.quota;
      const slipBy = Object.fromEntries(slips.map((s) => [s.user_id, s]));
      setPaidStatus(slips.length && slips.every((s) => s.status === "paid") ? "paid" : "draft");
      const initAdj = {};
      const result = staff.map((p) => {
        const st = periodStats(p, attByUserDay, leaveDaySet, from, to, holSet, settings);
        const yu = yearUsed[p.id] || {}; let over = 0;
        ["vacation", "personal", "sick"].forEach((t) => { over += Math.max(0, (yu[t] || 0) - (quota[t] ?? 0)); });
        st.overLeave = Math.min(st.leaveDays, over);
        const slip = slipBy[p.id];
        initAdj[p.id] = { bonus: Number(slip?.bonus) || 0, other_deduct: Number(slip?.other_deduct) || 0 };
        return { p, st, slip };
      });
      setAdj(initAdj); setRows(result);
    } catch (e) { flash("คำนวณไม่สำเร็จ: " + (e.message || e) + " (รัน 051_payroll.sql แล้วหรือยัง?)", true); setRows([]); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [ym]);

  const calcOf = (r) => computePayslip({ ...r.p, bonus: adj[r.p.id]?.bonus || 0, other_deduct: adj[r.p.id]?.other_deduct || 0, advance: advByUser[r.p.id] || 0 }, r.st, {});
  const setA = (id, k, v) => setAdj((s) => ({ ...s, [id]: { ...s[id], [k]: Number(v) || 0 } }));
  const payable = (rows || []).filter((r) => (Number(r.p.base_pay) || 0) > 0 || r.st.present > 0);
  const totalNet = payable.reduce((a, r) => a + calcOf(r).net, 0);

  async function saveRun(markPaid) {
    setBusy(true);
    try {
      let runNet = 0;
      for (const r of payable) {
        const c = calcOf(r); runNet += c.net;
        await savePayslip({ period: ym, user_id: r.p.id, pay_type: r.p.pay_type || "monthly",
          base: c.base, ot_pay: c.otPay, present_days: r.st.present, absent_days: r.st.absent, leave_days: r.st.leaveDays, over_leave_days: r.st.overLeave,
          late_min: r.st.lateMin, ot_min: r.st.otMin, d_late: c.dLate, d_absent: c.dAbsent, d_leave: c.dLeave, d_sso: c.dSso, d_advance: c.dAdvance,
          bonus: c.bonus, other_deduct: c.otherDeduct, net: c.net, status: markPaid ? "paid" : "draft" });
      }
      if (markPaid) {
        await setPayslipPaid(ym, true);
        // settle the advances deducted this run so they aren't deducted again next month
        const ids = payable.flatMap((r) => advIdsByUser[r.p.id] || []);
        await markAdvancesPaid(ym, ids);
        // link to Cash Flow: projected outflow on the month's pay date (วันสิ้นเดือน) — best-effort
        // (ฝ่ายบุคคล/hr อาจไม่มีสิทธิ์เขียนกระแสเงินสด → ปล่อยให้บัญชีซิงค์ทีหลังได้ ไม่บล็อกการจ่าย)
        await upsertPayrollCashEntry(ym, runNet, payDate, payable.length).catch(() => {});
      }
      flash(markPaid ? "บันทึก + ทำจ่ายเงินเดือนแล้ว ✓ (เข้ากระแสเงินสดแล้ว)" : "บันทึกรอบเงินเดือนแล้ว ✓"); await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  // cancel a paid run → revert slips to draft, un-settle the advances, remove the cash-flow line; redo anytime
  async function cancelPay() {
    if (!await confirmDialog(`ยกเลิกการจ่ายเงินเดือนรอบ ${ym}?\n• สลิปกลับเป็นฉบับร่าง (แก้ไข/คำนวณใหม่ได้)\n• ยอดเบิกล่วงหน้าที่หักไป คืนสภาพ\n• ลบรายการในกระแสเงินสด`)) return;
    setBusy(true);
    try {
      await setPayslipPaid(ym, false);
      await unsettleAdvances(ym);
      await removePayrollCashEntry(ym).catch(() => {});   // best-effort (hr อาจไม่มีสิทธิ์กระแสเงินสด)
      flash("ยกเลิกการจ่ายแล้ว — แก้ไขข้อมูลแล้วกด “ทำจ่ายทั้งรอบ” ใหม่ได้"); await load();
    } catch (e) { flash("ยกเลิกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="sec-head">
        <div><div className="sec-title">เงินเดือน · รอบ {ym}</div>
          <div className="sec-sub">รอบตัดวันที่ 25 — {from} ถึง {to} · จ่ายวันสิ้นเดือน (วันที่ {lastDay}) {paidStatus === "paid" ? "· ✅ จ่ายแล้ว" : ""}</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="inp" type="month" value={ym} onChange={(e) => setYm(e.target.value)} style={{ width: 160 }} />
          {paidStatus === "paid" ? (
            <>
              <span className="job-badge b-green">✅ จ่ายแล้ว · เข้ากระแสเงินสด</span>
              <button className="btn-ghost sm danger" disabled={busy} onClick={cancelPay}>ยกเลิกจ่าย</button>
            </>
          ) : (
            <>
              <button className="btn-ghost sm" disabled={busy || !payable.length} onClick={() => saveRun(false)}>บันทึกรอบ</button>
              <button className="btn-primary sm ok" disabled={busy || !payable.length} onClick={() => saveRun(true)}>ทำจ่ายทั้งรอบ</button>
            </>
          )}
        </div>
      </div>
      {loading ? <div className="empty">กำลังคำนวณ…</div> : payable.length === 0 ? <div className="empty">ยังไม่มีพนักงานที่ตั้งฐานเงินเดือน — ไปตั้งที่แท็บ “กะ & ตั้งค่า”</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="hr-table pay-table">
            <thead><tr><th style={{ textAlign: "left" }}>พนักงาน</th><th>ฐาน</th><th>OT (ชม.)</th><th>หักสาย</th><th>หักขาด</th><th>หักลาเกิน</th><th>ปกส.</th><th>หักเบิกล่วงหน้า</th><th>โบนัส</th><th>หักอื่นๆ</th><th>สุทธิ</th><th>สลิป</th></tr></thead>
            <tbody>
              {payable.map((r) => { const c = calcOf(r); return (
                <tr key={r.p.id}>
                  <td style={{ textAlign: "left" }}><b>{r.p.name || r.p.email}</b><div className="jo-dim">{r.p.pay_type === "daily" ? `รายวัน · มา ${r.st.present} วัน` : "รายเดือน"}{r.st.absent ? ` · ขาด ${r.st.absent}` : ""}{r.st.lateMin ? ` · สาย ${Math.round(r.st.lateMin)} น.` : ""}</div></td>
                  <td>{fmtBaht(c.base)}</td>
                  <td className="hr-ok">{c.otHours ? `${c.otHours.toFixed(1)} = ${fmtBaht(c.otPay)}` : "—"}</td>
                  <td className={c.dLate ? "hr-bad" : ""}>{c.dLate ? "−" + fmtBaht(c.dLate) : "—"}</td>
                  <td className={c.dAbsent ? "hr-bad" : ""}>{c.dAbsent ? "−" + fmtBaht(c.dAbsent) : "—"}</td>
                  <td className={c.dLeave ? "hr-bad" : ""}>{c.dLeave ? "−" + fmtBaht(c.dLeave) : "—"}</td>
                  <td className={c.dSso ? "hr-bad" : ""}>{c.dSso ? "−" + fmtBaht(c.dSso) : "—"}</td>
                  <td className={c.dAdvance ? "hr-bad" : ""}>{c.dAdvance ? "−" + fmtBaht(c.dAdvance) : "—"}</td>
                  <td><span className="inp inp-unit pay-adj"><span className="unit-pre">฿</span><input type="number" value={adj[r.p.id]?.bonus || 0} onChange={(e) => setA(r.p.id, "bonus", e.target.value)} /></span></td>
                  <td><span className="inp inp-unit pay-adj"><span className="unit-pre">฿</span><input type="number" value={adj[r.p.id]?.other_deduct || 0} onChange={(e) => setA(r.p.id, "other_deduct", e.target.value)} /></span></td>
                  <td style={{ fontWeight: 800, color: "var(--up)" }}>{fmtBaht(c.net)}</td>
                  <td><button className="btn-ghost sm" title="พิมพ์สลิป" onClick={() => { printWin.current = openPrintWindow(); setPrintSlip({ row: r, calc: c }); }}><UIcon name="catalog" size={14} /></button></td>
                </tr>
              ); })}
            </tbody>
            <tfoot><tr><td style={{ textAlign: "left" }}>รวมจ่ายสุทธิ ({payable.length} คน)</td><td colSpan={9} /><td style={{ fontWeight: 800 }}>{fmtBaht(totalNet)}</td><td /></tr></tfoot>
          </table>
        </div>
      )}
      <p className="page-sub" style={{ marginTop: 10 }}>* ฐานรายเดือน = เงินเดือนเต็ม · ฐานรายวัน = วันที่มา × ค่าแรง/วัน · OT = ชม.OT × เรตที่ตั้ง · หักสาย/ขาด คิดจากเรตรายชั่วโมง/วัน · ปกส. 5% (เพดานฐาน 17,500 = สูงสุด 875) · แก้โบนัส/หักอื่นๆ ได้ในตาราง แล้วกด “บันทึกรอบ”</p>
      {paidStatus === "paid" && <p className="page-sub" style={{ marginTop: 6, color: "var(--down)", fontWeight: 600 }}>🔒 รอบนี้จ่ายแล้ว — ตัวเลขในตารางอัปเดตตามข้อมูลล่าสุดเสมอ แต่สลิปที่บันทึก + รายการกระแสเงินสด ถูกล็อกไว้ ณ ตอนจ่าย · ถ้าแก้เวลาเข้างาน/ลา/เบิกล่วงหน้า แล้วต้องการให้มีผลกับสลิปและกระแสเงินสด ให้กด “ยกเลิกจ่าย” แล้ว “ทำจ่ายทั้งรอบ” ใหม่</p>}

      {printSlip && (() => { const r = printSlip.row, c = printSlip.calc, p = r.p; return (
        <div className="print-area payslip-print">
          <div className="ps-co-name">{company.name || "AMC AIR"}</div>
          {company.address && <div className="ps-co-addr">{company.address}</div>}
          <div className="ps-title">สลิปเงินเดือน · PAYSLIP</div>
          <div className="ps-period">รอบเดือน {ym} · งวด {from} ถึง {to} · จ่ายวันที่ {payDate}</div>
          <div className="ps-emp"><b>{p.name || p.email}</b>{p.department ? ` · ${p.department}` : ""} · {p.pay_type === "daily" ? "รายวัน" : "รายเดือน"}</div>
          <table className="ps-tbl">
            <tbody>
              <tr className="ps-h"><td colSpan={2}>รายได้</td></tr>
              <tr><td>{p.pay_type === "daily" ? `ค่าแรง (${r.st.present} วัน)` : "เงินเดือน"}</td><td className="r">{fmtBaht(c.base)}</td></tr>
              {c.otPay > 0 && <tr><td>ค่าล่วงเวลา OT ({c.otHours.toFixed(1)} ชม.)</td><td className="r">{fmtBaht(c.otPay)}</td></tr>}
              {c.bonus > 0 && <tr><td>โบนัส/เบี้ยเลี้ยง</td><td className="r">{fmtBaht(c.bonus)}</td></tr>}
              <tr className="ps-sub"><td>รวมรายได้</td><td className="r">{fmtBaht(c.gross)}</td></tr>
              <tr className="ps-h"><td colSpan={2}>รายการหัก</td></tr>
              {c.dLate > 0 && <tr><td>หักมาสาย</td><td className="r">−{fmtBaht(c.dLate)}</td></tr>}
              {c.dAbsent > 0 && <tr><td>หักขาดงาน</td><td className="r">−{fmtBaht(c.dAbsent)}</td></tr>}
              {c.dLeave > 0 && <tr><td>หักลาเกินสิทธิ์</td><td className="r">−{fmtBaht(c.dLeave)}</td></tr>}
              {c.dSso > 0 && <tr><td>ประกันสังคม 5%</td><td className="r">−{fmtBaht(c.dSso)}</td></tr>}
              {c.dAdvance > 0 && <tr><td>หักเบิกเงินล่วงหน้า</td><td className="r">−{fmtBaht(c.dAdvance)}</td></tr>}
              {c.otherDeduct > 0 && <tr><td>หักอื่นๆ</td><td className="r">−{fmtBaht(c.otherDeduct)}</td></tr>}
              <tr className="ps-sub"><td>รวมรายการหัก</td><td className="r">−{fmtBaht(c.ded)}</td></tr>
              <tr className="ps-net"><td>เงินได้สุทธิ</td><td className="r">{fmtBaht(c.net)}</td></tr>
            </tbody>
          </table>
          <div className="ps-att">สถิติงวดนี้: มา {r.st.present} · ขาด {r.st.absent} · ลา {r.st.leaveDays} · สาย {r.st.lateCnt} ครั้ง · OT {(r.st.otHours || 0).toFixed(1)} ชม.</div>
          <div className="ps-sign"><div>ลงชื่อ ........................ ผู้จ่ายเงิน</div><div>ลงชื่อ ........................ ผู้รับเงิน</div></div>
        </div>
      ); })()}
    </div>
  );
}

// one editable salary row — controlled so saved values show clearly (and re-sync after reload)
function PayRow({ p, onSave }) {
  const [payType, setPayType] = React.useState(p.pay_type || "monthly");
  const [basePay, setBasePay] = React.useState(p.base_pay ?? 0);
  const [otRate, setOtRate] = React.useState(p.ot_rate ?? 0);
  const [sso, setSso] = React.useState(!!p.sso);
  React.useEffect(() => { setPayType(p.pay_type || "monthly"); setBasePay(p.base_pay ?? 0); setOtRate(p.ot_rate ?? 0); setSso(!!p.sso); }, [p.pay_type, p.base_pay, p.ot_rate, p.sso]);
  // Thai law: OT rate = salary ÷ 30 ÷ 8 × 1.5
  const calcAutoOt = (bp) => Math.round((Number(bp) / 30 / 8) * 1.5 * 100) / 100;
  const saveBase = (val) => {
    const v = Number(val) || 0;
    const fields = {};
    if (v !== (Number(p.base_pay) || 0)) fields.base_pay = v;
    if (v > 0 && (Number(p.ot_rate) || 0) === 0) {
      const auto = calcAutoOt(v);
      fields.ot_rate = auto;
      setOtRate(auto);
    }
    if (Object.keys(fields).length) onSave(fields);
  };
  const applyAutoOt = () => {
    const v = calcAutoOt(basePay);
    setOtRate(v);
    onSave({ ot_rate: v });
  };
  return (
    <div className="hr-pay-row">
      <div className="hr-name"><b>{p.name || p.email}</b></div>
      <select className="inp" style={{ width: 110 }} value={payType} onChange={(e) => { setPayType(e.target.value); onSave({ pay_type: e.target.value }); }}>
        <option value="monthly">รายเดือน</option><option value="daily">รายวัน</option>
      </select>
      <span className="inp inp-unit" style={{ width: 130 }} title={payType === "daily" ? "ค่าแรงต่อวัน" : "เงินเดือนต่อเดือน"}><span className="unit-pre">฿</span>
        <input type="number" min="0" value={basePay} onChange={(e) => setBasePay(e.target.value)} onBlur={(e) => saveBase(e.target.value)} /></span>
      <span className="inp inp-unit" style={{ width: 140 }} title="เรต OT วันทำงานปกติ (× 1.5)"><span className="unit-pre">OT ฿</span>
        <input type="number" min="0" value={otRate} onChange={(e) => setOtRate(e.target.value)} onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== (Number(p.ot_rate) || 0)) onSave({ ot_rate: v }); }} /><span className="unit-suf">/ชม.</span></span>
      <button className="btn-ghost sm" type="button" title={`คำนวณ: ${basePay}÷30÷8×1.5 = ${calcAutoOt(basePay)} บ./ชม.`} onClick={applyAutoOt} style={{ fontSize: 11, padding: "2px 6px" }}>÷30÷8×1.5</button>
      <label className="hr-sso"><input type="checkbox" checked={sso} onChange={(e) => { setSso(e.target.checked); onSave({ sso: e.target.checked }); }} /> ประกันสังคม</label>
    </div>
  );
}

// upload / replace / remove a staff member's document signature (admin)
function SigRow({ p, onSaved, flash }) {
  const inp = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  async function onFile(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = "";
    if (!f) return;
    setBusy(true);
    try { const url = await uploadSignature(f); await updateHrProfile(p.id, { signature_url: url }); flash(`อัปโหลดลายเซ็น ${p.name || p.email} แล้ว ✓`); onSaved(); }
    catch (err) { flash("ไม่สำเร็จ: " + (err.message || err), true); }
    setBusy(false);
  }
  async function remove() {
    if (!await confirmDialog(`ลบลายเซ็นของ ${p.name || p.email}?`)) return;
    try { await updateHrProfile(p.id, { signature_url: null }); flash("ลบลายเซ็นแล้ว"); onSaved(); }
    catch (err) { flash("ลบไม่สำเร็จ: " + (err.message || err), true); }
  }
  return (
    <div className="hr-staff-row">
      <div className="hr-name"><b>{p.name || p.email}</b></div>
      {p.signature_url ? <img src={p.signature_url} alt="" className="hr-sig-thumb" /> : <span className="jo-dim">— ยังไม่มีลายเซ็น —</span>}
      <input ref={inp} type="file" accept="image/*" hidden onChange={onFile} />
      <button className="btn-ghost sm" disabled={busy} onClick={() => inp.current?.click()}><UIcon name="plus" size={13} /> {busy ? "…" : (p.signature_url ? "เปลี่ยน" : "อัปโหลด")}</button>
      {p.signature_url && <button className="btn-ghost sm danger" onClick={remove}><UIcon name="trash" size={13} /></button>}
    </div>
  );
}

function StaffTab({ staff, settings, holidays, onReload, flash }) {
  const [s, setS] = React.useState(settings);
  const [nh, setNh] = React.useState({ day: "", name: "" });
  React.useEffect(() => { setS(settings); }, [settings]);

  // ตำแหน่งงาน = ตำแหน่งจากเมนูตั้งค่า (สิทธิ์ตามตำแหน่ง) ที่พนักงานประจำถืออยู่จริง — นับจำนวนคนต่อตำแหน่ง
  const posCount = staff.reduce((m, p) => { const k = p.department || "ไม่ระบุ"; m[k] = (m[k] || 0) + 1; return m; }, {});
  const posList = Object.keys(posCount).sort((a, b) => posCount[b] - posCount[a]);

  async function saveSettings() {
    try { await saveHrSettings(s); flash("บันทึกเวลาทำงานแล้ว ✓"); onReload(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e) + " (รัน 041_hr.sql + 039 แล้วหรือยัง?)", true); }
  }
  async function setPattern(p, keyOrFields, val) {
    const fields = typeof keyOrFields === "string" ? { [keyOrFields]: val } : keyOrFields; // accepts (p, {…}) or (p, key, val)
    try { await updateHrProfile(p.id, fields); onReload(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function addHoliday() { if (!nh.day) return; try { await saveHoliday(nh.day, nh.name || "วันหยุด"); setNh({ day: "", name: "" }); onReload(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  async function delHoliday(d) { try { await deleteHoliday(d); onReload(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); } }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">เวลาทำงานมาตรฐาน</div></div>
          <button className="btn-primary sm" onClick={saveSettings}>บันทึก</button></div>
        <div className="fld-row">
          <label className="fld"><span>เข้างาน</span><input className="inp" type="time" value={s.start} onChange={(e) => setS({ ...s, start: e.target.value })} /></label>
          <label className="fld"><span>เลิกงาน</span><input className="inp" type="time" value={s.end} onChange={(e) => setS({ ...s, end: e.target.value })} /></label>
          <label className="fld"><span>ผ่อนผันสาย (นาที)</span><input className="inp" type="number" min="0" value={s.graceMin} onChange={(e) => setS({ ...s, graceMin: Number(e.target.value) || 0 })} /></label>
        </div>
        <div className="fld-row">
          <label className="fld"><span>โควต้าพักร้อน/ปี</span><input className="inp" type="number" min="0" value={s.quota?.vacation ?? 6} onChange={(e) => setS({ ...s, quota: { ...s.quota, vacation: Number(e.target.value) || 0 } })} /></label>
          <label className="fld"><span>โควต้าลากิจ/ปี</span><input className="inp" type="number" min="0" value={s.quota?.personal ?? 3} onChange={(e) => setS({ ...s, quota: { ...s.quota, personal: Number(e.target.value) || 0 } })} /></label>
          <label className="fld"><span>โควต้าลาป่วย/ปี</span><input className="inp" type="number" min="0" value={s.quota?.sick ?? 30} onChange={(e) => setS({ ...s, quota: { ...s.quota, sick: Number(e.target.value) || 0 } })} /></label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">ค่าจ้าง / เงินเดือน (ต่อคน)</div><div className="sec-sub">ตั้งฐานเงินเดือน (รายเดือน/รายวัน) · เรต OT ต่อชั่วโมง · ประกันสังคม 5% (เพดาน 17,500 = สูงสุด 875)</div></div></div>
        <div className="set-list">
          {staff.map((p) => <PayRow key={p.id} p={p} onSave={(fields) => setPattern(p, fields)} />)}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">ตำแหน่งงาน</div><div className="sec-sub">ตำแหน่งอ้างอิงจากบทบาทในเมนูตั้งค่า · กำหนดตำแหน่งให้พนักงานที่ ตั้งค่า → ผู้ใช้งาน (แสดงเฉพาะพนักงานประจำ)</div></div></div>
        <div className="pos-chips">
          {posList.length === 0 && <span className="jo-dim">ยังไม่มีพนักงานประจำ</span>}
          {posList.map((p) => (
            <span className="pos-chip" key={p}>{p} <b style={{ opacity: .6 }}>· {posCount[p]}</b></span>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">ลายเซ็นพนักงาน</div><div className="sec-sub">อัปโหลดลายเซ็นให้แต่ละคน · ใช้บนเอกสาร (เจ้าตัวเปิด/ปิดเองที่หน้าเข้างาน) · แนะนำไฟล์ PNG พื้นหลังโปร่ง</div></div></div>
        <div className="set-list">
          {staff.map((p) => <SigRow key={p.id} p={p} onSaved={onReload} flash={flash} />)}
        </div>
      </div>

      <div className="damage-layout">
        <div className="card">
          <div className="sec-head"><div><div className="sec-title">กะงานพนักงาน</div><div className="sec-sub">กำหนดตำแหน่ง + วันทำงานแต่ละคน</div></div></div>
          <div className="set-list">
            {staff.map((p) => (
              <div className="hr-staff-row" key={p.id}>
                <div className="hr-name"><b>{p.name || p.email}</b><span className="jo-dim">{p.department || "—"}</span></div>
                <select className="inp" style={{ width: 150 }} value={p.work_pattern || "mon_sat"} onChange={(e) => setPattern(p, "work_pattern", e.target.value)}>
                  {WORK_PATTERNS.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                </select>
                {p.work_pattern === "mon_fri_alt_sat" && (
                  <select className="inp" style={{ width: 92 }} value={p.sat_group || "A"} onChange={(e) => setPattern(p, "sat_group", e.target.value)}>
                    <option value="A">เสาร์ A</option><option value="B">เสาร์ B</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="sec-head"><div><div className="sec-title">วันหยุดประจำปี</div></div></div>
          <div className="set-add">
            <input className="inp" type="date" value={nh.day} onChange={(e) => setNh({ ...nh, day: e.target.value })} />
            <input className="inp" placeholder="ชื่อวันหยุด" value={nh.name} onChange={(e) => setNh({ ...nh, name: e.target.value })} />
            <button className="btn-primary" onClick={addHoliday}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่ม</button>
          </div>
          <div className="set-list">
            {holidays.length === 0 && <div className="empty sm">ยังไม่มีวันหยุด</div>}
            {holidays.map((h) => (
              <div className="hr-hol-row" key={h.day}><span>{thDate(h.day)} · {h.name}</span>
                <button className="btn-ghost sm" onClick={() => delHoliday(h.day)}><UIcon name="trash" size={14} /></button></div>
            ))}
          </div>
        </div>
      </div>

      <QuotaCard staff={staff} settings={settings} flash={flash} />
    </>
  );
}

// per-person leave quota (this year). Edit the entitlement; remaining = quota − approved used.
function QuotaCard({ staff, settings, flash }) {
  const year = new Date().getFullYear();
  const def = (settings && settings.quota) || { vacation: 6, personal: 3, sick: 30 };
  const [over, setOver] = React.useState({});   // userId → {vacation,personal,sick}
  const [used, setUsed] = React.useState({});    // userId → {vacation,personal,sick}
  const [loading, setLoading] = React.useState(true);
  async function load() {
    try {
      const [q, lv] = await Promise.all([getLeaveQuotas(year), listLeaves("approved")]);
      setOver(Object.fromEntries(q.map((r) => [r.user_id, r])));
      const u = {}; lv.filter((l) => String(l.start_date).startsWith(String(year))).forEach((l) => { (u[l.user_id] = u[l.user_id] || {})[l.type] = (u[l.user_id]?.[l.type] || 0) + Number(l.days || 0); });
      setUsed(u);
    } catch (e) { flash("โหลดโควต้าไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  const qOf = (id) => ({ vacation: over[id]?.vacation ?? def.vacation, personal: over[id]?.personal ?? def.personal, sick: over[id]?.sick ?? def.sick });
  async function save(id, type, val) {
    const next = { ...qOf(id), [type]: Math.max(0, Number(val) || 0) };
    setOver((o) => ({ ...o, [id]: { ...(o[id] || {}), ...next } }));
    try { await saveLeaveQuota(id, year, next); } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  const COLS = [["vacation", "พักร้อน"], ["personal", "ลากิจ"], ["sick", "ลาป่วย"]];
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="sec-head"><div><div className="sec-title">โควต้าวันลารายบุคคล (ปี {year + 543})</div>
        <div className="sec-sub">ปรับจำนวนวันลาของแต่ละคนได้ · เหลือ = โควต้า − ที่อนุมัติแล้ว</div></div></div>
      {loading ? <div className="empty">กำลังโหลด…</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="hr-table hr-quota-table">
            <thead>
              <tr><th style={{ textAlign: "left" }}>ชื่อ</th>{COLS.map(([k, l]) => <th key={k} colSpan={2}>{l}</th>)}</tr>
              <tr><th></th>{COLS.map(([k]) => <React.Fragment key={k}><th>โควต้า</th><th>เหลือ</th></React.Fragment>)}</tr>
            </thead>
            <tbody>
              {staff.map((p) => { const q = qOf(p.id); return (
                <tr key={p.id}>
                  <td style={{ textAlign: "left" }}><b>{p.name || p.email}</b><div className="jo-dim">{p.department || "-"}</div></td>
                  {COLS.map(([k]) => { const rem = q[k] - (used[p.id]?.[k] || 0); return (
                    <React.Fragment key={k}>
                      <td><input className="inp hr-q-inp" type="number" min="0" value={q[k]} onChange={(e) => save(p.id, k, e.target.value)} /></td>
                      <td className={rem < 0 ? "hr-bad" : rem === 0 ? "hr-warn" : "hr-ok"}>{rem}</td>
                    </React.Fragment>
                  ); })}
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
