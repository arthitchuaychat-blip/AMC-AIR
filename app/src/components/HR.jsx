import React from "react";
import { listAttendance, listLeaves, decideLeave, updateLeave, deleteLeave, deleteAttendance, setAttendanceOtOk, setAttendanceHolOk, listHrStaff, updateHrProfile, getHrSettings, saveHrSettings, listHolidays, saveHoliday, deleteHoliday, getLeaveQuotas, saveLeaveQuota, listPayslips, savePayslips, setPayslipPaid, upsertPayrollCashEntry, removePayrollCashEntry, unsettleAdvances, listJobOrders, listTeams, getCompanies, adminSaveAttendance, listAdvances, decideAdvance, updateAdvance, deleteAdvance, markAdvancesPaid, uploadSignature, getProfile, listAccounts, payAdvanceOut, uploadExpenseFile, listChatRooms, sendChatMessage, sendChatImage, createDmRoom, bookSalaryEntry, removeSalaryEntry, uploadChatImage, logAudit } from "../lib/api";
import html2canvas from "html2canvas";
import { openPrintWindow, writeAndPrint } from "../lib/printDoc";
import { confirmDialog } from "./ConfirmDialog";
import { DEFAULT_HR_SETTINGS, dayStat, fmtMin, fmtTime, isWorkday, WORK_PATTERNS, patternLabel, leaveLabel, leaveDays, leaveDaysInYear, leaveDaysInRange, LEAVE_TYPES, LEAVE_HOURS_PER_DAY, buildLeaveDaySet, leaveFrac, leaveAmountText, minutesOf, distKm, hrYmd, hrParseYmd, todayYmd, clockSkewFlag } from "../lib/hr";
import { payPeriod, periodStats, computePayslip, frozenPayslip } from "../lib/payroll";
import { listOt, decideOt, markOtPaid, unsettleOt, hrCheckoutOt, hrEditOt, otHoursFromTimes, createAutoOt, removeAutoOt, listOtOn, AUTO_OT_REASON, listLoans, saveLoan, deleteLoan, markLoanPaid, unsettleLoan } from "../lib/api";   // OT + เงินยืม (mig 184/186/191)
import { listHrProfiles, saveHrProfile } from "../lib/api";   // ประวัติพนักงาน + เอกสาร (mig 235)
import { fmtBaht } from "../lib/format";
import { ROLE_GUIDE, DEPT_COLOR } from "../lib/handbook";   // KPI ตามตำแหน่ง (แสดงในรายงานประสิทธิผล)
import { UIcon } from "../icons";
import PayDetailModal from "./PayDetail";

const TABS = [["today", "วันนี้"], ["calendar", "ปฏิทิน"], ["leaves", "อนุมัติลา"], ["ot", "อนุมัติ OT"], ["advances", "เบิกล่วงหน้า"], ["loans", "เงินยืม"], ["employees", "ประวัติพนักงาน"], ["report", "รายงาน/สถิติ"], ["payroll", "เงินเดือน"], ["perf", "ประสิทธิผล"], ["staff", "กะ & ตั้งค่า"]];
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
      {tab === "calendar" && <CalendarTab staff={staff} settings={settings} holidays={holidays} holSet={holSet} flash={flash} />}
      {tab === "leaves" && <LeavesTab staff={staff} holSet={holSet} canManage={canManage} lockSelfId={lockSelfId} flash={flash} />}
      {tab === "ot" && <OtTab canManage={canManage} lockSelfId={lockSelfId} flash={flash} />}
      {tab === "advances" && <AdvancesTab canManage={canManage} lockSelfId={lockSelfId} flash={flash} />}
      {tab === "loans" && <LoansTab staff={staff} canManage={canManage} flash={flash} />}
      {tab === "employees" && <EmployeesTab staff={staff} canManage={canManage} flash={flash} />}
      {tab === "report" && <ReportTab staff={staff} settings={settings} holSet={holSet} canManage={canManage} flash={flash} />}
      {tab === "payroll" && <PayrollTab staff={staff} settings={settings} holSet={holSet} flash={flash} />}
      {tab === "perf" && <PerfTab staff={staff} settings={settings} holSet={holSet} flash={flash} />}
      {tab === "staff" && <StaffTab staff={staff} settings={settings} holidays={holidays} onReload={loadBase} flash={flash} />}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// ---------- ประวัติพนักงาน + เอกสาร (mig 235) ----------
function EmployeesTab({ staff, canManage, flash }) {
  const [profs, setProfs] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [edit, setEdit] = React.useState(null);
  async function load() { try { setProfs(await listHrProfiles()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setProfs({}); } }
  React.useEffect(() => { load(); }, []);
  const list = staff.filter((s) => !q.trim() || [s.name, s.email, s.department].some((f) => String(f || "").toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">ประวัติพนักงาน & เอกสาร</div>
        <div className="sec-sub">ข้อมูลติดต่อ · ผู้ติดต่อฉุกเฉิน · บัญชีธนาคาร · สัญญา/เอกสาร — เห็นได้เฉพาะเจ้าของ + ธุรการ/ผู้บริหาร/บุคคล (ต้องรัน migration 235)</div></div></div>
      <div className="cat-search" style={{ maxWidth: 360, marginBottom: 12 }}><UIcon name="search" size={15} color="var(--ink-3)" /><input placeholder="ค้นหาพนักงาน" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {profs === null ? <div className="empty">กำลังโหลด…</div> : list.length === 0 ? <div className="empty">ไม่พบพนักงาน</div> : (
        <div className="job-cards">
          {list.map((s) => {
            const p = profs[s.id] || {}; const docs = p.documents || [];
            const filled = [p.phone, p.address, p.emergency_phone, p.bank_account].filter(Boolean).length;
            return (
              <div className="card job-card" key={s.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{s.name}</b>{p.nickname ? <span className="jo-dim"> ({p.nickname})</span> : null}
                    <div className="jo-dim" style={{ fontSize: 12.5, marginTop: 2 }}>{s.department || s.role}{s.hire_date ? ` · เริ่มงาน ${s.hire_date}` : ""}</div>
                    <div className="jo-dim" style={{ fontSize: 12.5 }}>{p.phone ? `📞 ${p.phone}` : "— ยังไม่มีเบอร์ —"}{docs.length ? ` · 📎 ${docs.length} เอกสาร` : ""}{filled < 4 ? <span style={{ color: "#d97706" }}> · ⚠ ข้อมูลไม่ครบ</span> : ""}</div>
                  </div>
                  {canManage && <button className="btn-ghost sm" onClick={() => setEdit({ id: s.id, staff: s, ...p })}><UIcon name="edit" size={13} /> แก้ประวัติ</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {edit && <EmployeeModal emp={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} flash={flash} />}
    </div>
  );
}
function EmployeeModal({ emp, onClose, onSaved, flash }) {
  const [f, setF] = React.useState({ nickname: emp.nickname || "", phone: emp.phone || "", address: emp.address || "", birth_date: emp.birth_date || "", emergency_name: emp.emergency_name || "", emergency_phone: emp.emergency_phone || "", bank_name: emp.bank_name || "", bank_account: emp.bank_account || "", position_title: emp.position_title || "", note: emp.note || "", documents: emp.documents || [] });
  const [busy, setBusy] = React.useState(false);
  const [upBusy, setUpBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const fileRef = React.useRef(null);
  const s = emp.staff || {};
  async function pickDocs(e) {
    const list = Array.from(e.target.files || []); e.target.value = ""; if (!list.length) return;
    setUpBusy(true);
    try { const add = []; for (const file of list) { const url = await uploadExpenseFile(file); add.push({ name: file.name, url }); } set("documents", [...(f.documents || []), ...add]); }
    catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
    setUpBusy(false);
  }
  async function save() { setBusy(true); try { await saveHrProfile(emp.id, f); flash("บันทึกประวัติแล้ว ✓"); onSaved(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } setBusy(false); }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560, maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-head"><div className="modal-title">ประวัติ · {s.name}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          <div className="jo-dim" style={{ marginBottom: 10, fontSize: 12.5 }}>{s.department || s.role}{s.hire_date ? ` · เริ่มงาน ${s.hire_date}` : ""}{s.citizen_id ? ` · เลขบัตร ${s.citizen_id}` : ""}</div>
          <div className="fld-row">
            <label className="fld"><span>ชื่อเล่น</span><input className="inp" value={f.nickname} onChange={(e) => set("nickname", e.target.value)} /></label>
            <label className="fld"><span>เบอร์โทร</span><input className="inp" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="08x-xxx-xxxx" /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>วันเกิด</span><input className="inp" type="date" value={f.birth_date || ""} onChange={(e) => set("birth_date", e.target.value)} /></label>
            <label className="fld"><span>ตำแหน่งตามสัญญา</span><input className="inp" value={f.position_title} onChange={(e) => set("position_title", e.target.value)} placeholder="เช่น ช่างเทคนิค" /></label>
          </div>
          <label className="fld"><span>ที่อยู่</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={f.address} onChange={(e) => set("address", e.target.value)} /></label>
          <div className="fld-row">
            <label className="fld"><span>ผู้ติดต่อฉุกเฉิน</span><input className="inp" value={f.emergency_name} onChange={(e) => set("emergency_name", e.target.value)} placeholder="ชื่อ · ความสัมพันธ์" /></label>
            <label className="fld"><span>เบอร์ฉุกเฉิน</span><input className="inp" value={f.emergency_phone} onChange={(e) => set("emergency_phone", e.target.value)} /></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>ธนาคาร</span><input className="inp" value={f.bank_name} onChange={(e) => set("bank_name", e.target.value)} placeholder="เช่น กสิกรไทย" /></label>
            <label className="fld"><span>เลขบัญชี (จ่ายเงินเดือน)</span><input className="inp" value={f.bank_account} onChange={(e) => set("bank_account", e.target.value)} /></label>
          </div>
          <label className="fld"><span>หมายเหตุ</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} /></label>
          <div className="fld"><span>📎 เอกสาร (สัญญาจ้าง · สำเนาบัตร · วุฒิ ฯลฯ)</span>
            {(f.documents || []).length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 5, margin: "4px 0 8px" }}>
              {f.documents.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, background: "var(--surface-2)", borderRadius: 8, padding: "5px 10px" }}>
                  <a href={d.url} target="_blank" rel="noreferrer" style={{ flex: 1, color: "var(--primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📄 {d.name || "เอกสาร"}</a>
                  <button type="button" className="tb-cmt-x" onClick={() => set("documents", f.documents.filter((_, j) => j !== i))}><UIcon name="x" size={12} /></button>
                </div>
              ))}
            </div>}
            <input ref={fileRef} type="file" multiple hidden onChange={pickDocs} />
            <button type="button" className="btn-ghost sm" disabled={upBusy} onClick={() => fileRef.current?.click()}><UIcon name="plus" size={13} /> {upBusy ? "กำลังอัปโหลด…" : "แนบเอกสาร"}</button>
          </div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>บันทึกประวัติ</button></div>
      </div>
    </div>
  );
}

// ---------- TODAY ----------
function TodayTab({ staff, settings, holSet, canManage, lockSelfId, flash }) {
  const [att, setAtt] = React.useState([]);
  const [onLeave, setOnLeave] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState(null); // { p, a, day? } row being corrected (day = แก้ย้อนหลังจากแถบลืมเช็คเอาท์)
  const [day, setDay] = React.useState(todayYmd());   // เลือกดูวันไหนก็ได้ ไม่ใช่แค่วันนี้
  const [missing, setMissing] = React.useState([]);   // 7 วันหลัง: เช็คอินแล้วแต่ไม่ได้เช็คเอาท์ — เตือนให้ HR ตามแก้
  const [autoOt, setAutoOt] = React.useState(new Set());   // คนที่ HR อนุมัติ OT จากเวลาจริงของวันนี้แล้ว (mig 191)
  async function load() {
    try {
      const [a, lv, ots] = await Promise.all([listAttendance(day, day), listLeaves("approved"), listOtOn(day).catch(() => [])]);
      setAtt(a);
      const m = {}; lv.forEach((l) => { if (l.start_date <= day && l.end_date >= day) m[l.user_id] = { t: l.type, h: Number(l.hours) > 0 ? Number(l.hours) : null }; }); setOnLeave(m);
      setAutoOt(new Set((ots || []).filter((o) => o.reason === AUTO_OT_REASON && o.status !== "rejected").map((o) => o.user_id)));
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  async function loadMissing() {
    try {
      const to = new Date(); to.setDate(to.getDate() - 1);
      const from = new Date(); from.setDate(from.getDate() - 7);
      const rows = await listAttendance(hrYmd(from), hrYmd(to));
      setMissing(rows.filter((x) => x.check_in_at && !x.check_out_at));
    } catch { /* ตัวเตือนอย่างเดียว โหลดพลาดไม่ต้องรบกวน */ }
  }
  React.useEffect(() => { load(); }, [day]);
  React.useEffect(() => { loadMissing(); }, []);
  // แนว A: HR อนุมัติ OT วันทำงานจากเวลาที่อยู่จริง = สร้างใบ hr_ot อนุมัติ (พนักงานไม่ต้องยื่นเอง)
  async function approveAsOt(p, a, s) {
    const to = a?.check_out_at ? `${String(new Date(a.check_out_at).getHours()).padStart(2, "0")}:${String(new Date(a.check_out_at).getMinutes()).padStart(2, "0")}` : null;
    try { await createAutoOt({ user_id: p.id, ot_date: day, time_from: settings.end || "17:00", time_to: to, hours: s.otHours }); flash(`อนุมัติ OT ${s.otHours} ชม. ให้ ${p.name || p.email} แล้ว ✓`); load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function unapproveOt(p) {
    try { await removeAutoOt(p.id, day); flash(`ถอน OT ของ ${p.name || p.email} แล้ว`); load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  // วันหยุด: รับรอง/ถอนรับรอง งานวันหยุด (mig 191) — ต้องรับรองก่อน ค่าวันหยุดถึงคิดเข้าเงินเดือน
  async function toggleHol(p, a, ok) {
    try { await setAttendanceHolOk(p.id, a.work_date || day, ok); flash(ok ? `รับรองงานวันหยุดของ ${p.name || p.email} แล้ว ✓` : `ถอนการรับรองวันหยุดของ ${p.name || p.email}`); load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e) + " (รัน migration 191 แล้วหรือยัง?)", true); }
  }
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
    if (onLeave[p.id] && !onLeave[p.id].h) status = "leave";   // ลาราย ชม. — วันนั้นยังต้องเข้างาน จึงนับสถานะตามปกติ
    else if (a?.check_in_at) status = a?.check_out_at ? "out" : (s.isLate ? "late" : "in");
    else if (work) status = "absent";
    return { p, a, s, status, work };
  });
  const order = { in: 0, late: 1, out: 2, absent: 3, leave: 4, off: 5 };
  rows.sort((x, y) => order[x.status] - order[y.status] || (x.p.name || "").localeCompare(y.p.name || "", "th"));
  const ST = { in: { t: "เข้างานแล้ว", c: "b-green" }, late: { t: "มาสาย", c: "b-amber" }, out: { t: "ออกงานแล้ว", c: "b-cyan" }, absent: { t: "ยังไม่เข้า/ขาด", c: "b-red" }, leave: { t: "ลา", c: "b-blue" }, off: { t: "วันหยุด", c: "b-grey" } };
  // รูปเซลฟี่ (กดดูเต็ม) + หมุด GPS ตอนเช็คอิน/เอาท์ — หลักฐานที่เก็บอยู่แล้ว เอามาให้ HR เห็น
  const thumb = (url, title) => url ? <img src={url} alt="" title={title} loading="lazy" style={{ width: 26, height: 26, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line)", cursor: "zoom-in", verticalAlign: "middle" }} onClick={() => window.open(url, "_blank")} /> : null;
  const pin = (lat, lng, title) => (lat != null && lng != null) ? <a href={`https://maps.google.com/?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" title={title} style={{ textDecoration: "none", fontSize: 13 }}>📍</a> : null;
  // ป้ายเตือนเช็คอิน/เอาท์ไกลจากพิกัดร้าน (ตั้งใน กะ & ตั้งค่า) — ไว้ดูประกอบ ไม่ได้บล็อก
  const shopGeo = React.useMemo(() => { const m = String(settings.geo || "").split(","); const lat = Number(m[0]), lng = Number(m[1]); return isFinite(lat) && isFinite(lng) && lat ? { lat, lng } : null; }, [settings.geo]);
  const farTag = (lat, lng) => { if (!shopGeo || lat == null || lng == null) return null; const km = distKm(shopGeo.lat, shopGeo.lng, lat, lng); return km > (Number(settings.geoKm) || 1) ? <span className="att-tag late sm" title="ระยะจากพิกัดร้านที่ตั้งไว้">ไกลร้าน {km < 10 ? km.toFixed(1) : Math.round(km)} กม.</span> : null; };
  if (loading) return <div className="empty">กำลังโหลด…</div>;
  return (
    <div className="card">
      {canManage && missing.length > 0 && (
        <div style={{ border: "1.5px solid #f59e0b", background: "#fffbeb", borderRadius: 12, padding: "9px 12px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: "#b45309", marginBottom: 4 }}>⏰ ลืมเช็คเอาท์ {missing.length} รายการ (7 วันหลัง) — แก้เวลาให้เรียบร้อยก่อนคิดเงินเดือน</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {missing.map((x) => { const p = staff.find((s) => s.id === x.user_id) || { id: x.user_id, name: x.name };
              return (
                <button key={x.id} className="btn-ghost sm" style={{ borderColor: "#f59e0b" }} title="กดเพื่อแก้เวลาเข้า-ออกของวันนั้น"
                  onClick={() => setEdit({ p, a: x, day: x.work_date })}>
                  {x.name} · {thDate(x.work_date)} (เข้า {fmtTime(x.check_in_at)})
                </button>
              ); })}
          </div>
        </div>
      )}
      <div className="sec-head"><div><div className="sec-title">{thDate(day)}{day === todayYmd() ? " (วันนี้)" : ""}</div>
        <div className="sec-sub">เข้าแล้ว {rows.filter((r) => r.status === "in" || r.status === "late" || r.status === "out").length} · ออกแล้ว {rows.filter((r) => r.status === "out").length} · ยังไม่เข้า {rows.filter((r) => r.status === "absent").length} · ลา {rows.filter((r) => r.status === "leave").length}</div></div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="date" className="inp" style={{ width: 160 }} value={day} onChange={(e) => { setLoading(true); setDay(e.target.value || todayYmd()); }} />
          {day !== todayYmd() && <button className="btn-ghost sm" onClick={() => { setLoading(true); setDay(todayYmd()); }}>วันนี้</button>}
        </div></div>
      <div className="set-list">
        {rows.map(({ p, a, s, status, work }) => { const b = ST[status];
          const rowManage = canManage && p.id !== lockSelfId;   // ฝ่ายบุคคลแก้เวลาได้ทุกคน ยกเว้นของตัวเอง
          return (
          <div className="hr-today-row" key={p.id}>
            <div className="hr-name"><b>{p.name || p.email}</b><span className="jo-dim">{p.department || "-"}</span></div>
            <div className="hr-times">
              <span>เข้า <b>{fmtTime(a?.check_in_at)}</b>{s?.isLate && <span className="att-tag late sm">+{fmtMin(s.lateMin)}</span>}{clockSkewFlag(a) && <span className="att-tag sm" style={{ background: "#fef3c7", color: "#b45309" }} title={clockSkewFlag(a)}>⏱</span>} {thumb(a?.check_in_photo, "เซลฟี่ตอนเช็คอิน — กดดูเต็ม")}{pin(a?.check_in_lat, a?.check_in_lng, "พิกัดตอนเช็คอิน — เปิดแผนที่")}{farTag(a?.check_in_lat, a?.check_in_lng)}</span>
              <span>ออก <b>{fmtTime(a?.check_out_at)}</b>{work && s?.otHours > 0 && <span className="att-tag ot sm" title="เวลาที่อยู่เกินเวลาเลิกงาน — คิดเป็นเงิน OT เฉพาะที่ HR กดอนุมัติ">OT {s.otHours} ชม.{autoOt.has(p.id) ? " ✓" : " · รออนุมัติ"}</span>}{!work && a?.check_in_at && <span className="att-tag sm" style={{ background: a?.hol_ok ? "#dcfce7" : "#fef3c7", color: a?.hol_ok ? "#15803d" : "#b45309" }} title="ทำงานวันหยุด — คิดค่าวันหยุดเฉพาะที่ HR กดรับรอง">วันหยุด{a?.hol_ok ? " ✓" : " · รอรับรอง"}</span>} {thumb(a?.check_out_photo, "เซลฟี่ตอนเช็คเอาท์ — กดดูเต็ม")}{pin(a?.check_out_lat, a?.check_out_lng, "พิกัดตอนเช็คเอาท์ — เปิดแผนที่")}{farTag(a?.check_out_lat, a?.check_out_lng)}</span>
            </div>
            <span className={"job-badge " + b.c}>{status === "leave" ? leaveLabel(onLeave[p.id]?.t) : b.t}</span>
            {status !== "leave" && onLeave[p.id]?.h > 0 && <span className="job-badge b-blue">{leaveLabel(onLeave[p.id].t)} {onLeave[p.id].h} ชม.</span>}
            {/* แนว A: OT วันทำงาน — HR อนุมัติจากเวลาที่อยู่จริง (พนักงานไม่ต้องยื่นเอง) */}
            {canManage && work && s?.otHours > 0 && (autoOt.has(p.id)
              ? <button className="btn-ghost sm" title="อนุมัติแล้ว — กดเพื่อถอน OT วันนี้" onClick={() => unapproveOt(p)}>OT ✓ {s.otHours} ชม.</button>
              : (a?.check_out_at
                  ? <button className="btn-primary sm ok" title="อนุมัติเวลาที่อยู่เกินเป็น OT เข้าเงินเดือน" onClick={() => approveAsOt(p, a, s)}>อนุมัติเป็น OT {s.otHours} ชม.</button>
                  : <span className="jo-dim" style={{ fontSize: 11 }} title="ต้องเช็คเอาท์ก่อนจึงคิดชั่วโมง OT ได้">รอเช็คเอาท์</span>))}
            {/* วันหยุด — ต้องรับรองก่อน ค่าวันหยุดถึงคิดเข้าเงินเดือน (mig 191) */}
            {canManage && !work && a?.check_in_at && (a?.hol_ok
              ? <button className="btn-ghost sm" title="รับรองแล้ว — กดเพื่อถอนการรับรองวันหยุด" onClick={() => toggleHol(p, a, false)}>วันหยุด ✓</button>
              : (a?.check_out_at
                  ? <button className="btn-primary sm ok" title="รับรองงานวันหยุดให้คิดค่าวันหยุดเข้าเงินเดือน" onClick={() => toggleHol(p, a, true)}>รับรองวันหยุด</button>
                  : <span className="jo-dim" style={{ fontSize: 11 }} title="ต้องเช็คเอาท์ก่อนจึงคิดค่าวันหยุดได้">รอเช็คเอาท์</span>))}
            {rowManage && <button className="btn-ghost sm" title="แก้ไขเวลาเข้า-ออก" onClick={() => setEdit({ p, a })}><UIcon name="edit" size={13} /></button>}
            {rowManage && a && <button className="btn-ghost sm danger" title="ลบเวลาเข้า-ออก" onClick={() => delAtt(p)}><UIcon name="trash" size={13} /></button>}
            {canManage && !rowManage && <span className="jo-dim" title="ฝ่ายบุคคลแก้เวลาของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารแก้ให้" style={{ fontSize: 11 }}>🔒 ของตัวเอง</span>}
          </div>
        ); })}
      </div>
      {edit && <AttEditModal day={edit.day || day} row={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); loadMissing(); }} flash={flash} />}
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

// ---------- CALENDAR (ปฏิทินภาพรวม: มา/สาย/ลา/ขาด/วันหยุดบริษัท) ----------
function CalendarTab({ staff, settings, holidays, holSet, flash }) {
  const pad2 = (n) => String(n).padStart(2, "0");
  const [ym, setYm] = React.useState(() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; });
  const [att, setAtt] = React.useState([]);
  const [leaves, setLeaves] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  // ตัวกรอง: รายบุคคล · ประเภทการลา · มาสาย · ขาด · วันหยุดบริษัท
  const [person, setPerson] = React.useState("all");
  const [lvTypes, setLvTypes] = React.useState(() => new Set(LEAVE_TYPES.map((t) => t.id)));
  const [showLate, setShowLate] = React.useState(true);
  const [showAbsent, setShowAbsent] = React.useState(true);
  const [showHol, setShowHol] = React.useState(true);
  const [sel, setSel] = React.useState(null);   // วันที่กดดูรายชื่อ
  const [y, m] = ym.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const from = `${ym}-01`, to = `${ym}-${pad2(daysInMonth)}`;
  React.useEffect(() => {
    let dead = false; setLoading(true); setSel(null);
    Promise.all([listAttendance(from, to), listLeaves("approved")])
      .then(([a, l]) => { if (!dead) { setAtt(a); setLeaves(l); } })
      .catch((e) => flash("โหลดไม่สำเร็จ: " + (e.message || e), true))
      .finally(() => !dead && setLoading(false));
    return () => { dead = true; };
  }, [ym]);
  const today = todayYmd();
  const holByDay = React.useMemo(() => Object.fromEntries(holidays.map((h) => [h.day, h.name])), [holidays]);
  const leaveDaySet = React.useMemo(() => buildLeaveDaySet(leaves, from, to), [leaves, from, to]);
  const attBy = React.useMemo(() => { const o = {}; att.forEach((a) => { (o[a.user_id] = o[a.user_id] || {})[a.work_date] = a; }); return o; }, [att]);
  const people = person === "all" ? staff : staff.filter((p) => String(p.id) === String(person));
  const one = people.length === 1 ? people[0] : null;
  const toggleLv = (id) => setLvTypes((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // สรุปของวันหนึ่ง (ตามตัวกรอง)
  const dayInfo = (k) => {
    const out = { leave: [], late: [], absent: [], present: [] };
    for (const p of people) {
      const lv = leaveDaySet[p.id]?.[k];
      if (lv && lvTypes.has(lv.t)) out.leave.push({ p, lv });
      const a = attBy[p.id]?.[k];
      if (a?.check_in_at) { const s = dayStat(a, settings); (s.isLate ? out.late : out.present).push({ p, s }); }
      else if (!lv && k <= today && !holByDay[k] && isWorkday(k, p.work_pattern || "mon_sat", p.sat_group, holSet)) out.absent.push({ p });
    }
    return out;
  };
  const cells = [];
  const lead = new Date(y, m - 1, 1).getDay();               // 0=อาทิตย์
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym}-${pad2(d)}`);
  const chip = (bg, fg, txt, key) => <span key={key} style={{ background: bg, color: fg, borderRadius: 7, padding: "1px 6px", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap" }}>{txt}</span>;
  const selInfo = sel ? dayInfo(sel) : null;
  const monthNav = (d) => { const x = new Date(y, m - 1 + d, 1); setYm(`${x.getFullYear()}-${pad2(x.getMonth() + 1)}`); };
  return (
    <div className="card">
      <div className="sec-head" style={{ flexWrap: "wrap", gap: 8 }}>
        <div><div className="sec-title">ปฏิทินภาพรวม</div><div className="sec-sub">มาทำงาน · มาสาย · ลา · ขาด · วันหยุดบริษัท — กดที่วันเพื่อดูรายชื่อ</div></div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn-ghost sm" onClick={() => monthNav(-1)}>←</button>
          <input type="month" className="inp" style={{ width: 150 }} value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} />
          <button className="btn-ghost sm" onClick={() => monthNav(1)}>→</button>
        </div>
      </div>
      <div className="cat-filter" style={{ marginBottom: 10, gap: 6, flexWrap: "wrap" }}>
        <select className="inp" style={{ width: 180 }} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="all">👥 ทุกคน ({staff.length})</option>
          {staff.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
        </select>
        {LEAVE_TYPES.map((t) => (
          <button key={t.id} className={"cat-chip" + (lvTypes.has(t.id) ? " on" : "")} onClick={() => toggleLv(t.id)}
            style={lvTypes.has(t.id) ? { background: "#2563eb", color: "#fff", borderColor: "#2563eb" } : {}}>{t.label}</button>
        ))}
        <button className={"cat-chip" + (showLate ? " on" : "")} onClick={() => setShowLate(!showLate)} style={showLate ? { background: "#d97706", color: "#fff", borderColor: "#d97706" } : {}}>มาสาย</button>
        <button className={"cat-chip" + (showAbsent ? " on" : "")} onClick={() => setShowAbsent(!showAbsent)} style={showAbsent ? { background: "#dc2626", color: "#fff", borderColor: "#dc2626" } : {}}>ขาด</button>
        <button className={"cat-chip" + (showHol ? " on" : "")} onClick={() => setShowHol(!showHol)} style={showHol ? { background: "#0891b2", color: "#fff", borderColor: "#0891b2" } : {}}>วันหยุดบริษัท</button>
      </div>
      {loading ? <div className="empty sm">กำลังโหลด…</div> : (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d, i) => <div key={d} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 800, color: i === 0 ? "#dc2626" : "var(--ink-3)", padding: "2px 0" }}>{d}</div>)}
        {cells.map((k, i) => {
          if (!k) return <div key={"b" + i} />;
          const hol = holByDay[k];
          const inf = dayInfo(k);
          const isToday = k === today;
          return (
            <button key={k} type="button" onClick={() => setSel(sel === k ? null : k)}
              style={{ minHeight: 74, textAlign: "left", border: "1.5px solid " + (sel === k ? "#2563eb" : isToday ? "#93c5fd" : "var(--line)"), borderRadius: 10, padding: "4px 6px", background: hol && showHol ? "#ecfeff" : "#fff", display: "flex", flexDirection: "column", gap: 3, cursor: "pointer" }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: isToday ? "#2563eb" : "var(--ink-2)" }}>{Number(k.slice(8))}{isToday ? " · วันนี้" : ""}</span>
              {hol && showHol && <span style={{ fontSize: 10, color: "#0e7490", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🏖 {hol}</span>}
              <span style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {one ? <>
                  {inf.present.length > 0 && chip("#dcfce7", "#15803d", "มาทำงาน", "p")}
                  {showLate && inf.late.length > 0 && chip("#fef3c7", "#b45309", `สาย ${fmtMin(inf.late[0].s.lateMin)}`, "l")}
                  {inf.leave.map((x, j) => chip("#dbeafe", "#1d4ed8", leaveLabel(x.lv.t) + (x.lv.h ? ` ${x.lv.h} ชม.` : ""), "v" + j))}
                  {showAbsent && inf.absent.length > 0 && chip("#fee2e2", "#b91c1c", "ขาด", "a")}
                </> : <>
                  {inf.leave.length > 0 && chip("#dbeafe", "#1d4ed8", `ลา ${inf.leave.length}`, "v")}
                  {showLate && inf.late.length > 0 && chip("#fef3c7", "#b45309", `สาย ${inf.late.length}`, "l")}
                  {showAbsent && inf.absent.length > 0 && chip("#fee2e2", "#b91c1c", `ขาด ${inf.absent.length}`, "a")}
                  {inf.present.length > 0 && chip("#dcfce7", "#15803d", `มา ${inf.present.length + inf.late.length}`, "p")}
                </>}
              </span>
            </button>
          );
        })}
      </div>
      {sel && selInfo && (
        <div style={{ marginTop: 10, border: "1.5px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>{thDate(sel)} {holByDay[sel] ? `· 🏖 ${holByDay[sel]}` : ""}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8, fontSize: 12.5 }}>
            <div><b style={{ color: "#1d4ed8" }}>ลา ({selInfo.leave.length})</b>{selInfo.leave.map((x, i) => <div key={i}>• {x.p.name} — {leaveLabel(x.lv.t)}{x.lv.h ? ` ${x.lv.h} ชม.` : ""}</div>)}</div>
            {showLate && <div><b style={{ color: "#b45309" }}>มาสาย ({selInfo.late.length})</b>{selInfo.late.map((x, i) => <div key={i}>• {x.p.name} — สาย {fmtMin(x.s.lateMin)}</div>)}</div>}
            {showAbsent && <div><b style={{ color: "#b91c1c" }}>ขาด ({selInfo.absent.length})</b>{selInfo.absent.map((x, i) => <div key={i}>• {x.p.name}</div>)}</div>}
            <div><b style={{ color: "#15803d" }}>มาทำงาน ({selInfo.present.length + selInfo.late.length})</b>{selInfo.present.map((x, i) => <div key={i}>• {x.p.name}</div>)}</div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

// ---------- LEAVES ----------
function LeavesTab({ staff, holSet, canManage, lockSelfId, flash }) {
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
              {leaveLabel(l.type)} · {thDate(l.start_date)}{l.end_date !== l.start_date ? ` – ${thDate(l.end_date)}` : ""} <span className="att-days">{leaveAmountText(l)}</span>
              {l.reason && <div className="jo-dim">เหตุผล: {l.reason}</div>}</div>
            <div className="hr-leave-act">
              <span className={"job-badge " + b.c}>{b.t}</span>
              {/* ฝ่ายบุคคลอนุมัติ/แก้/ลบใบลาของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารเป็นคนตัดสิน (แบบเดียวกับล็อกเวลาเข้างาน) */}
              {l.user_id === lockSelfId ? <span className="jo-dim" title="ใบลาของตัวเอง — ให้ธุรการ/ผู้บริหารอนุมัติ" style={{ fontSize: 11 }}>🔒 ของตัวเอง</span> : <>
                {l.status === "pending" && <button className="btn-primary sm ok" onClick={() => decide(l, "approved")}>อนุมัติ</button>}
                {l.status === "pending" && <button className="btn-ghost sm" onClick={() => decide(l, "rejected")}>ไม่อนุมัติ</button>}
                {l.status !== "pending" && <button className="btn-ghost sm" onClick={() => decide(l, "pending")}>คืนรออนุมัติ</button>}
                {canManage && <button className="btn-ghost sm" title="แก้ไขใบลา" onClick={() => setEdit(l)}><UIcon name="edit" size={13} /></button>}
                {canManage && <button className="btn-ghost sm danger" title="ลบใบลา" onClick={() => del(l)}><UIcon name="trash" size={13} /></button>}
              </>}
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
  // ลาราย ชม. — แก้ช่วงเวลาได้ (8 ชม. = 1 วัน)
  const [mode, setMode] = React.useState(Number(leave.hours) > 0 ? "hour" : "day");
  const [tFrom, setTFrom] = React.useState(String(leave.time_from || "08:00").slice(0, 5));
  const [tTo, setTTo] = React.useState(String(leave.time_to || "12:00").slice(0, 5));
  const hours = mode === "hour" ? Math.max(0, Math.round(((minutesOf(tTo) ?? 0) - (minutesOf(tFrom) ?? 0)) / 30) / 2) : 0;
  const person = staff.find((p) => p.id === leave.user_id);
  const days = mode === "hour"
    ? Math.round(hours / LEAVE_HOURS_PER_DAY * 100) / 100
    : ((start && end && end >= start) ? leaveDays(start, end, person?.work_pattern || "mon_sat", person?.sat_group, holSet) : 1);
  async function save() {
    if (mode === "hour" && hours <= 0) { flash("ช่วงเวลาไม่ถูกต้อง", true); return; }
    if (!start || !end || end < start) { flash("ช่วงวันที่ไม่ถูกต้อง", true); return; }
    setBusy(true);
    try {
      await updateLeave(leave.id, { type, start_date: start, end_date: mode === "hour" ? start : end, days, reason,
        hours: mode === "hour" ? hours : null, time_from: mode === "hour" ? tFrom : null, time_to: mode === "hour" ? tTo : null });
      flash("บันทึกใบลาแล้ว ✓"); onSaved();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-head"><div className="modal-title">แก้ไขใบลา · {leave.name}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>ประเภทการลา</span>
              <select className="inp" value={type} onChange={(e) => setType(e.target.value)}>{LEAVE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="fld"><span>ช่วงการลา</span>
              <select className="inp" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="day">เต็มวัน</option><option value="hour">ราย ชม.</option>
              </select></label>
          </div>
          {mode === "hour" ? (
            <div className="fld-row" style={{ marginTop: 8 }}>
              <label className="fld"><span>วันที่ลา</span><input className="inp" type="date" value={start} onChange={(e) => { setStart(e.target.value); setEnd(e.target.value); }} /></label>
              <label className="fld"><span>ตั้งแต่เวลา</span><input className="inp" type="time" value={tFrom} onChange={(e) => setTFrom(e.target.value)} /></label>
              <label className="fld"><span>ถึงเวลา</span><input className="inp" type="time" value={tTo} onChange={(e) => setTTo(e.target.value)} /></label>
            </div>
          ) : (
            <div className="fld-row" style={{ marginTop: 8 }}>
              <label className="fld"><span>วันเริ่ม</span><input className="inp" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <label className="fld"><span>วันสิ้นสุด</span><input className="inp" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
            </div>
          )}
          <label className="fld" style={{ marginTop: 8 }}><span>เหตุผล</span><input className="inp" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <p className="page-sub" style={{ marginTop: 6 }}>{mode === "hour"
            ? <>รวม <b>{hours}</b> ชม. (= {days} วัน · คิด {LEAVE_HOURS_PER_DAY} ชม. = 1 วัน)</>
            : <>รวม <b>{days}</b> วันทำงาน (คำนวณจากกะของพนักงาน · ไม่นับวันหยุด)</>}</p>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>บันทึก</button></div>
      </div>
    </div>
  );
}

// ---------- CASH ADVANCES (เบิกเงินล่วงหน้า) ----------
function AdvancesTab({ canManage, lockSelfId, flash }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [edit, setEdit] = React.useState(null); // advance being edited
  const [payFor, setPayFor] = React.useState(null);   // โอนจ่ายจริง (เลือกบัญชี + สลิป)
  const [slipFor, setSlipFor] = React.useState(null); // ส่งสลิปเข้าแชตพนักงาน
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
              {a.paid_out_at && <div className="jo-dim">💸 โอนให้พนักงานแล้ว {thDate(a.paid_out_at.slice(0, 10))}</div>}
              {a.status === "paid" && a.period && <div className="jo-dim">หักในรอบ {a.period}</div>}</div>
            <div className="hr-leave-act">
              {a.pay_slip_url && <img src={a.pay_slip_url} alt="สลิปโอนเงิน" title="สลิปโอนเงิน — กดดูเต็ม" style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 7, border: "1px solid var(--line)", cursor: "zoom-in" }} onClick={() => window.open(a.pay_slip_url, "_blank")} />}
              <span className={"job-badge " + b.c}>{b.t}</span>
              {canManage && a.status === "approved" && !a.paid_out_at && <button className="btn-primary sm" onClick={() => setPayFor(a)}>💸 โอนจ่าย + สลิป</button>}
              {canManage && a.pay_slip_url && <button className="btn-ghost sm" title="ส่งสลิปเข้าแชตให้พนักงาน" onClick={() => setSlipFor(a)}>📲 ส่งสลิปแชต</button>}
              {/* 🔒 โอนเงินให้พนักงานแล้ว ห้ามเปลี่ยนสถานะ/แก้/ลบ — ไม่งั้นเงินออกไปแล้วแต่ไม่ถูกหักเงินเดือน */}
              {/* ฝ่ายบุคคลอนุมัติ/แก้คำขอเบิกของตัวเองไม่ได้ — ให้ธุรการ/ผู้บริหารตัดสิน */}
              {a.user_id === lockSelfId ? <span className="jo-dim" title="คำขอของตัวเอง — ให้ธุรการ/ผู้บริหารอนุมัติ" style={{ fontSize: 11 }}>🔒 ของตัวเอง</span> : <>
                {a.status === "pending" && <button className="btn-primary sm ok" onClick={() => decide(a, "approved")}>อนุมัติ</button>}
                {a.status === "pending" && <button className="btn-ghost sm" onClick={() => decide(a, "rejected")}>ไม่อนุมัติ</button>}
                {!a.paid_out_at && a.status !== "paid" && a.status !== "pending" && <button className="btn-ghost sm" onClick={() => decide(a, "pending")}>คืนรออนุมัติ</button>}
                {canManage && !a.paid_out_at && a.status !== "paid" && <button className="btn-ghost sm" title="แก้ไขคำขอ" onClick={() => setEdit(a)}><UIcon name="edit" size={13} /></button>}
                {canManage && !a.paid_out_at && a.status !== "paid" && <button className="btn-ghost sm danger" title="ลบคำขอ" onClick={() => del(a)}><UIcon name="trash" size={13} /></button>}
              </>}
              {a.paid_out_at && a.status === "approved" && <span className="jo-dim" title="โอนเงินแล้ว — รอหักในรอบเงินเดือน">🔒</span>}
            </div>
          </div>
        ); })}
      </div>
      <p className="page-sub" style={{ marginTop: 8 }}>* ยอดที่ “อนุมัติ” แล้วจะถูกหักอัตโนมัติในรอบเงินเดือนถัดไป แล้วเปลี่ยนเป็น “หักแล้ว” เมื่อกดทำจ่ายทั้งรอบ</p>
      {edit && <AdvanceEditModal adv={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} flash={flash} />}
      {payFor && <PayAdvanceModal adv={payFor} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); load(); }} flash={flash} />}
      {slipFor && <SendAdvSlipModal adv={slipFor} onClose={() => setSlipFor(null)} flash={flash} />}
    </div>
  );
}

// ---- อนุมัติ OT (mig 184) — mirror AdvancesTab ----
function OtTab({ canManage, lockSelfId, flash }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  async function load() { try { setList(await listOt()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); } setLoading(false); }
  React.useEffect(() => { load(); }, []);
  async function decide(o, status) {
    const lbl = { approved: "อนุมัติ", rejected: "ไม่อนุมัติ", pending: "คืนเป็นรออนุมัติ" }[status];
    if (!await confirmDialog(`${lbl} OT ${o.hours} ชม. ของ ${o.name} (${thDate(o.ot_date)})?`)) return;
    try { await decideOt(o.id, status); flash(lbl + "แล้ว"); load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  const B = { pending: { t: "รออนุมัติ", c: "b-amber" }, approved: { t: "อนุมัติ · รอคิดเงิน", c: "b-blue" }, rejected: { t: "ไม่อนุมัติ", c: "b-red" }, paid: { t: "คิดเงินแล้ว", c: "b-green" } };
  if (loading) return <div className="empty">กำลังโหลด…</div>;
  const pending = list.filter((o) => o.status === "pending");
  const apprHours = list.filter((o) => o.status === "approved").reduce((s, o) => s + (Number(o.hours) || 0), 0);
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">อนุมัติ OT</div>
        <div className="sec-sub">รออนุมัติ {pending.length} รายการ · อนุมัติแล้วรอคิดในรอบถัดไป {apprHours.toFixed(1)} ชม.</div></div></div>
      <div className="set-list">
        {list.length === 0 && <div className="empty sm">ยังไม่มีใบขอ OT</div>}
        {list.map((o) => { const b = B[o.status] || B.pending; const awaitCheckout = o.status === "approved" && !(Number(o.hours) > 0); return (
          <div className="hr-leave-row" key={o.id}>
            <div><b>{o.name}</b> <span className="jo-dim">{o.department}</span><br />
              <b>{Number(o.hours) > 0 ? `${o.hours} ชม.` : "รอเช็คเอาท์"}</b> · {thDate(o.ot_date)} · เริ่ม {o.time_from}{o.time_to ? `–${o.time_to}` : ""}
              {o.job_no && <div className="jo-dim">🔧 งาน {o.job_no}{o.jobCustomer ? ` · ${o.jobCustomer}` : ""}{o.jobDetails ? ` · ${o.jobDetails}` : ""}</div>}
              {o.reason && <div className="jo-dim">เหตุผล: {o.reason}</div>}
              {o.status === "paid" && o.period && <div className="jo-dim">คิดในรอบ {o.period}</div>}</div>
            <div className="hr-leave-act">
              <span className={"job-badge " + (awaitCheckout ? "b-amber" : b.c)}>{awaitCheckout ? "อนุมัติ · รอเช็คเอาท์" : b.t}</span>
              {awaitCheckout && <HrOtCheckout ot={o} onDone={(m) => { flash(m); load(); }} flash={flash} />}
              {o.status !== "paid" && <HrOtEdit ot={o} onDone={(m) => { flash(m); load(); }} flash={flash} />}
              {o.user_id === lockSelfId ? <span className="jo-dim" style={{ fontSize: 11 }} title="ใบของตัวเอง — ให้ธุรการ/ผู้บริหารอนุมัติ">🔒 ของตัวเอง</span> : <>
                {o.status === "pending" && <button className="btn-primary sm ok" onClick={() => decide(o, "approved")}>อนุมัติ</button>}
                {o.status === "pending" && <button className="btn-ghost sm" onClick={() => decide(o, "rejected")}>ไม่อนุมัติ</button>}
                {o.status !== "paid" && o.status !== "pending" && <button className="btn-ghost sm" onClick={() => decide(o, "pending")}>คืนรออนุมัติ</button>}
              </>}
            </div>
          </div>
        ); })}
      </div>
      <p className="page-sub" style={{ marginTop: 8 }}>* พนักงานขอ OT (วัน+เวลาเริ่ม) → HR “อนุมัติ” → พนักงานกด “เช็คเอาท์ OT” เมื่อทำเสร็จ (ระบบคิดชั่วโมง) → เข้าคิดเงินรอบถัดไป (ชม. × เรต OT) แล้วเปลี่ยนเป็น “คิดเงินแล้ว” เมื่อทำจ่ายทั้งรอบ · <b>อนุมัติแล้วแต่ยังไม่เช็คเอาท์ = ยังไม่คิดเงิน</b></p>
    </div>
  );
}

// HR เช็คเอาท์ OT แทนพนักงาน (เผื่อลืม/ไม่สะดวก) — เลือกเวลาเลิก แล้วคิดชั่วโมง
function HrOtCheckout({ ot, onDone, flash }) {
  const nowHm = () => { const d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  const [open, setOpen] = React.useState(false);
  const [to, setTo] = React.useState(nowHm());
  const [busy, setBusy] = React.useState(false);
  const hrs = otHoursFromTimes(ot.time_from, to);
  async function submit() {
    if (!(hrs > 0)) return flash("เวลาเลิกต้องมากกว่าเวลาเริ่ม", true);
    setBusy(true);
    try { await hrCheckoutOt(ot.id, to); onDone(`เช็คเอาท์ OT ให้ ${ot.name} แล้ว`); }
    catch (e) { flash((e.message || e), true); }
    setBusy(false);
  }
  if (!open) return <button className="btn-primary sm ok" onClick={() => { setTo(nowHm()); setOpen(true); }}>🏁 เช็คเอาท์แทน</button>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input className="inp" type="time" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 108 }} />
      <span className="jo-dim" style={{ fontSize: 12 }}>= <b>{hrs}</b> ชม.</span>
      <button className="btn-primary sm ok" disabled={busy || !(hrs > 0)} onClick={submit}>ยืนยัน</button>
      <button className="btn-ghost sm" disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</button>
    </span>
  );
}

// HR แก้เวลา OT (เวลาเริ่ม/เลิก) — เผื่อพนักงานกรอกผิด · คิดชั่วโมงใหม่
function HrOtEdit({ ot, onDone, flash }) {
  const [open, setOpen] = React.useState(false);
  const [from, setFrom] = React.useState(ot.time_from || "17:00");
  const [to, setTo] = React.useState(ot.time_to || "");
  const [busy, setBusy] = React.useState(false);
  const hrs = to ? otHoursFromTimes(from, to) : 0;
  async function submit() {
    setBusy(true);
    try { await hrEditOt(ot.id, { time_from: from, time_to: to || null }); onDone("แก้เวลา OT แล้ว"); }
    catch (e) { flash((e.message || e), true); }
    setBusy(false);
  }
  if (!open) return <button className="btn-ghost sm" onClick={() => { setFrom(ot.time_from || "17:00"); setTo(ot.time_to || ""); setOpen(true); }}>✏️ แก้เวลา</button>;
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input className="inp" type="time" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 104 }} title="เวลาเริ่ม" />
      <span className="jo-dim">–</span>
      <input className="inp" type="time" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 104 }} title="เวลาเลิก (เว้นว่าง = ยังไม่เช็คเอาท์)" />
      <span className="jo-dim" style={{ fontSize: 12 }}>= <b>{hrs}</b> ชม.</span>
      <button className="btn-primary sm ok" disabled={busy} onClick={submit}>บันทึก</button>
      <button className="btn-ghost sm" disabled={busy} onClick={() => setOpen(false)}>ยกเลิก</button>
    </span>
  );
}

// ---- เงินยืมพนักงาน (mig 184) — HR เปิดยืม, ผ่อนอัตโนมัติจนครบ ----
function LoansTab({ staff, canManage, flash }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [ed, setEd] = React.useState(null);
  async function load() { try { setList(await listLoans()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); } setLoading(false); }
  React.useEffect(() => { load(); }, []);
  async function save() {
    if (!ed.user_id) return flash("เลือกพนักงานก่อน", true);
    try { await saveLoan(ed); setEd(null); flash("บันทึกแล้ว ✓"); load(); } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function del(l) {
    if (!await confirmDialog(`ลบเงินยืมของ ${l.name}? (ประวัติผ่อนจะหายด้วย)`)) return;
    try { await deleteLoan(l.id); flash("ลบแล้ว"); load(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  if (loading) return <div className="empty">กำลังโหลด…</div>;
  const active = list.filter((l) => l.status === "active");
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">เงินยืมพนักงาน</div>
        <div className="sec-sub">กำลังผ่อน {active.length} คน · หักผ่อนอัตโนมัติทุกรอบเงินเดือนจนครบ</div></div>
        {canManage && <button className="btn-primary" onClick={() => setEd({ user_id: "", principal: "", installment: "", note: "" })}><UIcon name="plus" size={15} color="#fff" /> เปิดเงินยืม</button>}
      </div>
      <div className="set-list">
        {list.length === 0 && <div className="empty sm">ยังไม่มีเงินยืม</div>}
        {list.map((l) => (
          <div className="hr-leave-row" key={l.id}>
            <div><b>{l.name}</b> <span className="jo-dim">{l.department}</span><br />
              ยืม <b>{fmtBaht(l.principal)}</b> · ผ่อนเดือนละ {fmtBaht(l.installment)}
              {l.note && <div className="jo-dim">{l.note}</div>}</div>
            <div className="hr-leave-act">
              <span className={"job-badge " + (l.status === "closed" ? "b-green" : "b-amber")}>{l.status === "closed" ? "ครบแล้ว" : "คงเหลือ " + fmtBaht(l.balance)}</span>
              {canManage && <button className="btn-ghost sm" onClick={() => setEd({ id: l.id, user_id: l.user_id, principal: l.principal, installment: l.installment, note: l.note || "" })}><UIcon name="edit" size={13} /></button>}
              {canManage && <button className="btn-ghost sm danger" onClick={() => del(l)}><UIcon name="trash" size={13} /></button>}
            </div>
          </div>
        ))}
      </div>
      {ed && (
        <div className="modal-overlay" onClick={() => setEd(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <div className="modal-head"><div className="modal-title">{ed.id ? "แก้ไขเงินยืม" : "เปิดเงินยืม"}</div><button className="modal-x" onClick={() => setEd(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <label className="fld"><span>พนักงาน</span>
                <select className="inp" value={ed.user_id} onChange={(e) => setEd({ ...ed, user_id: e.target.value })} disabled={!!ed.id}>
                  <option value="">— เลือกพนักงาน —</option>
                  {(staff || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
              <div className="fld-row">
                <label className="fld"><span>ยอดยืมรวม (บาท)</span><input className="inp" type="number" min="0" value={ed.principal} onChange={(e) => setEd({ ...ed, principal: e.target.value })} /></label>
                <label className="fld"><span>ผ่อนเดือนละ (บาท)</span><input className="inp" type="number" min="0" value={ed.installment} onChange={(e) => setEd({ ...ed, installment: e.target.value })} /></label>
              </div>
              <label className="fld"><span>หมายเหตุ</span><input className="inp" value={ed.note} onChange={(e) => setEd({ ...ed, note: e.target.value })} /></label>
              <button className="btn-primary" style={{ width: "100%", marginTop: 10 }} onClick={save}>บันทึก</button>
            </div>
          </div>
        </div>
      )}
      <p className="page-sub" style={{ marginTop: 8 }}>* หักผ่อนอัตโนมัติทุกรอบ (ไม่เกินยอดคงเหลือ) เมื่อกดทำจ่ายทั้งรอบ · ครบแล้วปิดเอง</p>
    </div>
  );
}

// โอนเงินเบิกล่วงหน้าให้พนักงานจริง — เลือกบัญชี + วันที่ + แนบสลิป (จำเป็น) เหมือนจ่ายช่างซัพ
function PayAdvanceModal({ adv, onClose, onPaid, flash }) {
  const [accounts, setAccounts] = React.useState(null);
  const [accountId, setAccountId] = React.useState("");
  const [payDate, setPayDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [slipUrl, setSlipUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { listAccounts().then((a) => { setAccounts(a); setAccountId((a.find((x) => x.kind === "bank") || a[0])?.id || ""); }).catch(() => setAccounts([])); }, []);
  async function onSlip(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { setSlipUrl(await uploadExpenseFile(f)); } catch (ex) { flash("อัปโหลดสลิปไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false); e.target.value = "";
  }
  async function pay() {
    if (!accountId) return flash("เลือกบัญชีที่จ่าย", true);
    if (!slipUrl) return flash("แนบสลิปโอนเงินก่อนบันทึกจ่าย", true);
    setBusy(true);
    try { await payAdvanceOut(adv.id, { accountId, payDate, slipUrl }); flash("บันทึกโอนจ่ายแล้ว ✓ (ลงเดินบัญชี + แจ้งเตือนพนักงาน)"); onPaid(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-head"><div className="modal-title">โอนเงินเบิกล่วงหน้า · {fmtBaht(adv.amount)}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>{adv.name} · {adv.reason || "เบิกล่วงหน้า"} — ยอดนี้จะถูกหักจากรอบเงินเดือนถัดไปตามเดิม</div>
          <label className="fld"><span>จ่ายจากบัญชี</span>
            {accounts === null ? <div className="jo-dim">กำลังโหลดบัญชี…</div> :
              <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((x) => <option key={x.id} value={x.id}>{(x.kind === "cash" ? "💵 " : "🏦 ") + x.name} (คงเหลือ {fmtBaht(x.balance)})</option>)}
              </select>}
          </label>
          <label className="fld"><span>วันที่โอน</span><input type="date" className="inp" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
          <label className="fld"><span>สลิปโอนเงิน (จำเป็น)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {slipUrl ? <img src={slipUrl} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 9, border: "1px solid var(--line)", cursor: "zoom-in" }} onClick={() => window.open(slipUrl, "_blank")} /> : null}
              <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
                📎 {uploading ? "กำลังอัปโหลด…" : slipUrl ? "เปลี่ยนสลิป" : "แนบสลิป/ถ่ายรูป"}
                <input type="file" accept="image/*" onChange={onSlip} style={{ display: "none" }} disabled={uploading} />
              </label>
              {slipUrl && <button type="button" className="btn-ghost sm danger" onClick={() => setSlipUrl("")}>ลบ</button>}
            </div>
          </label>
          <div className="jo-dim">บันทึกเป็น <b>เงินออก</b> ในบัญชีที่เลือก (เมนูเบิกจ่าย → เดินบัญชี &amp; กระทบแบงค์) และแจ้งเตือนพนักงานอัตโนมัติ</div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy || uploading || accounts === null} onClick={pay}>ยืนยันโอนจ่าย</button></div>
      </div>
    </div>
  );
}

// ส่งสลิปโอนเบิกล่วงหน้าเข้าแชต — ปุ่มลัดส่งเข้าแชตส่วนตัว (DM) ของพนักงานคนนั้น หรือเลือกห้องอื่นเอง
function SendAdvSlipModal({ adv, onClose, flash }) {
  const [rooms, setRooms] = React.useState([]);
  const [roomId, setRoomId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { listChatRooms().then((r) => { setRooms(r); setRoomId(r[0]?.id || ""); }).catch(() => {}); }, []);
  const slipText = `💸 โอนเงินเบิกล่วงหน้า · ${adv.name}\nจำนวน ${fmtBaht(adv.amount)}${adv.reason ? ` · ${adv.reason}` : ""}\n(ยอดนี้จะถูกหักจากรอบเงินเดือนถัดไป)`;
  async function sendTo(rid) {
    await sendChatMessage(rid, slipText);
    await sendChatImage(rid, adv.pay_slip_url);
  }
  // ส่งเข้าแชตส่วนตัวของพนักงานคนนี้โดยตรง — เปิด/สร้างห้อง DM ให้อัตโนมัติ
  async function sendDm() {
    setBusy(true);
    try { const rid = await createDmRoom(adv.user_id); await sendTo(rid); flash(`ส่งสลิปเข้าแชตส่วนตัวของ ${adv.name} แล้ว ✓`); onClose(); }
    catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function send() {
    if (!roomId) return flash("เลือกห้องแชตก่อน", true);
    setBusy(true);
    try { await sendTo(roomId); flash("ส่งสลิปเข้าแชตแล้ว ✓"); onClose(); }
    catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-head"><div className="modal-title">📲 ส่งสลิปเบิกล่วงหน้า · {adv.name}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <img src={adv.pay_slip_url} alt="" style={{ width: "100%", maxHeight: 260, objectFit: "contain", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)" }} />
          <button className="btn-primary" style={{ width: "100%", marginTop: 12 }} disabled={busy} onClick={sendDm}>
            👤 ส่งเข้าแชตส่วนตัวของ {adv.name}</button>
          <div className="jo-dim" style={{ textAlign: "center", margin: "8px 0 2px" }}>— หรือส่งเข้าห้องอื่น —</div>
          <label className="fld"><span>เลือกห้องแชต</span>
            <select className="inp" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-ghost" disabled={busy || !rooms.length} onClick={send}>ส่งเข้าห้องที่เลือก</button></div>
      </div>
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
function ReportTab({ staff, settings, holSet, canManage, flash }) {
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
      const [att, leaves, otAll] = await Promise.all([listAttendance(from, calcTo), listLeaves("approved"), listOt().catch(() => [])]);
      const attByUserDay = {}; att.forEach((a) => { (attByUserDay[a.user_id] = attByUserDay[a.user_id] || {})[a.work_date] = a; });
      const leaveDaySet = buildLeaveDaySet(leaves, from, calcTo);
      // OT = ใบขอ OT ที่อนุมัติ+เช็คเอาท์ หรือจ่ายปิดแล้ว (ตรงกับเงินเดือน) — ไม่ใช่ OT อัตโนมัติจากเช็คเอาท์
      const otByUser = {};
      (otAll || []).filter((o) => o.ot_date >= from && o.ot_date <= calcTo && (o.status === "approved" || o.status === "paid") && Number(o.hours) > 0).forEach((o) => { otByUser[o.user_id] = (otByUser[o.user_id] || 0) + Number(o.hours); });
      const result = staff.map((p) => {
        let present = 0, lateCnt = 0, lateMin = 0, absent = 0, workdays = 0, leaveCnt = 0, holDays = 0, holMin = 0;
        const otHours = Math.round((otByUser[p.id] || 0) * 100) / 100;
        for (let d = hrParseYmd(from); d <= hrParseYmd(calcTo); d.setDate(d.getDate() + 1)) {
          const k = hrYmd(d);
          const onLeave = leaveDaySet[p.id]?.[k];
          if (onLeave) { leaveCnt += leaveFrac(onLeave); if (!onLeave.h) continue; }   // ลาราย ชม. = เศษวัน และวันนั้นยังนับเข้า/ขาดตามปกติ
          if (!isWorkday(k, p.work_pattern || "mon_sat", p.sat_group, holSet)) {
            // มาทำงานวันหยุด — นับไว้โชว์ (ตรงกับ periodStats ฝั่งเงินเดือน)
            const ah = attByUserDay[p.id]?.[k];
            if (ah?.check_in_at) { holDays++; if (ah.check_out_at) holMin += Math.max(0, (minutesOf(ah.check_out_at) ?? 0) - (minutesOf(ah.check_in_at) ?? 0)); }
            continue;
          }
          workdays++;
          const a = attByUserDay[p.id]?.[k];
          if (a?.check_in_at) { present++; const s = dayStat(a, settings); if (s.isLate) { lateCnt++; lateMin += s.lateMin; } } // OT ไม่คิดจากเช็คเอาท์แล้ว — ดึงจากใบขอ OT (otByUser)
          else absent++;
        }
        leaveCnt = Math.round(leaveCnt * 100) / 100;
        return { p, present, lateCnt, lateMin, otHours, absent, workdays, leaveCnt, holDays, holHours: Math.round(holMin / 60 * 100) / 100 };
      });
      result.sort((a, b) => b.absent - a.absent || b.lateCnt - a.lateCnt); // worst first (for review)
      setRows(result); setRaw({ attByUserDay, leaveDaySet, from, calcTo });
    } catch (e) { flash("คำนวณไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { run(); }, [ym, settings]);   // settings มาช้ากว่าแท็บได้ — โหลดใหม่เมื่อค่าเวลางาน/โหมด OT มาถึง

  function exportCsv() {
    if (!rows) return;
    const head = ["ชื่อ", "แผนก", "วันทำงาน", "มา", "ขาด", "ลา", "สาย(ครั้ง)", "สายรวม(นาที)", "OT(ชม.)", "ทำงานวันหยุด(วัน)", "ทำงานวันหยุด(ชม.)"];
    const lines = rows.map((r) => [r.p.name, r.p.department || "", r.workdays, r.present, r.absent, r.leaveCnt, r.lateCnt, Math.round(r.lateMin), r.otHours || 0, r.holDays || 0, r.holHours || 0]);
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
      if (onLeave && !onLeave.h) kind = "leave";   // ลาเต็มวัน — ลาราย ชม. วันนั้นแสดงสถานะเข้างานตามจริง + ป้ายชั่วโมงลา
      else if (a?.check_in_at) { s = dayStat(a, settings); kind = s.isLate ? "late" : "present"; }
      else if (work) kind = "absent";
      else kind = "off";
      out.push({ k, kind, leaveType: onLeave?.t, leaveHours: onLeave?.h, a, s });
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
            <thead><tr><th style={{ textAlign: "left" }}>ชื่อ</th><th>แผนก</th><th>วันทำงาน</th><th>มา</th><th>ขาด</th><th>ลา</th><th>สาย</th><th>สายรวม</th><th>OT</th><th title="มาทำงานในวันหยุดของเขา — ชดเชยผ่านช่องโบนัสในเงินเดือน">วันหยุดที่มา</th></tr></thead>
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
                  <td className={r.holDays ? "hr-warn" : ""}>{r.holDays ? `${r.holDays} วัน (${r.holHours} ชม.)` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detail && <PersonDetail row={(rows || []).find((r) => r.p.id === detail.p.id) || detail} days={personDays(detail.p)}
        otNeeds={!!settings.otNeedsApproval} canManage={canManage} flash={flash} onChanged={run} onClose={() => setDetail(null)} />}
    </div>
  );
}

function PersonDetail({ row, days, onClose, canManage, flash, onChanged, otNeeds }) {
  const [editDay, setEditDay] = React.useState(null);   // แก้เวลาเข้า-ออกย้อนหลังของวันนั้น
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
                      {d.s?.otHours > 0 && <span className="att-tag sm" style={{ color: "var(--ink-3)" }} title="อยู่เกินเวลางาน — ไม่ใช่ OT จ่ายจริง (OT ต้องยื่นใบขอ+เช็คเอาท์)">เกินเวลา {d.s.otHours} ชม.</span>}</>
                    : "—"}
                  {d.kind !== "leave" && d.leaveHours > 0 && <span className="att-tag sm" style={{ color: "#2563eb" }}>{leaveLabel(d.leaveType)} {d.leaveHours} ชม.</span>}
                </span>
                <span className={"job-badge " + b.c}>{d.kind === "leave" ? leaveLabel(d.leaveType) : b.t}</span>
                {canManage && <button className="btn-ghost sm" title="แก้เวลาเข้า-ออกย้อนหลัง" onClick={() => setEditDay(d)}><UIcon name="edit" size={13} /></button>}
              </div>
            ); })}
          </div>
        </div>
        {editDay && <AttEditModal day={editDay.k} row={{ p: row.p, a: editDay.a }} flash={flash}
          onClose={() => setEditDay(null)} onSaved={() => { setEditDay(null); onChanged && onChanged(); }} />}
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
  const [kpiDetail, setKpiDetail] = React.useState(null);   // แถวพนักงานที่กดดู KPI ตามตำแหน่ง
  async function load() {
    setLoading(true);
    try {
      const [from, to] = monthRange(ym);
      const today = todayYmd(); const calcTo = to < today ? to : today;
      const [att, leaves, jobs, teams, otAll] = await Promise.all([listAttendance(from, calcTo), listLeaves("approved"), listJobOrders(), listTeams(), listOt().catch(() => [])]);
      const attByUserDay = {}; att.forEach((a) => { (attByUserDay[a.user_id] = attByUserDay[a.user_id] || {})[a.work_date] = a; });
      const leaveDaySet = buildLeaveDaySet(leaves, from, calcTo);
      const teamName = Object.fromEntries(teams.map((t) => [t.id, (t.name || "").replace("Team ", "")]));
      // OT = ใบขอ OT ที่อนุมัติ+เช็คเอาท์ (hours>0) หรือจ่ายปิดแล้ว — ตรงกับระบบเงินเดือน (ไม่ใช่ OT อัตโนมัติจากเช็คเอาท์)
      const otByUser = {};
      (otAll || []).filter((o) => o.ot_date >= from && o.ot_date <= calcTo && (o.status === "approved" || o.status === "paid") && Number(o.hours) > 0).forEach((o) => { otByUser[o.user_id] = (otByUser[o.user_id] || 0) + Number(o.hours); });
      // งานของทีม: ทีม = ทีมระดับใบ ถ้าไม่มี → ดูจากรอบนัด (job_visits) · วันงาน = วันใบหรือวันของรอบนัด (นับถ้ามีวันใดตกในเดือน)
      const jm = {};
      jobs.forEach((j) => {
        const team = j.assigned_team || (j.visits || []).map((v) => v.assigned_team).find(Boolean) || null;
        if (!team) return;
        const dates = [];
        if (j.scheduled_at) dates.push(hrYmd(new Date(j.scheduled_at)));
        (j.visits || []).forEach((v) => { if (v.scheduled_at) dates.push(hrYmd(new Date(v.scheduled_at))); else if (v.visit_date) dates.push(v.visit_date); });
        if (!dates.some((d) => d >= from && d <= to)) return;
        const m = jm[team] || (jm[team] = { done: 0, ratingSum: 0, ratingN: 0, claims: 0, resched: 0 });
        if (j.status === "done") m.done++; if (j.rating > 0) { m.ratingSum += j.rating; m.ratingN++; } if (j.is_claim) m.claims++; if (j.status === "reschedule") m.resched++;
      });
      const result = staff.map((p) => {
        const st = periodStats(p, attByUserDay, leaveDaySet, from, calcTo, holSet, settings);
        // ตรงเวลา = สัดส่วน "วันที่มาตรงเวลา" จากวันที่มาทำงานจริง (ไม่ปนการขาด — การขาดคิดในหมวด "มาทำงาน" แล้ว)
        const onTime = st.present ? Math.round((st.present - st.lateCnt) / st.present * 100) : null;
        const m = jm[p.team] || { done: 0, ratingSum: 0, ratingN: 0, claims: 0, resched: 0 };
        const avgRating = m.ratingN ? (m.ratingSum / m.ratingN) : null;
        const otHours = Math.round((otByUser[p.id] || 0) * 100) / 100;
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
  React.useEffect(() => { load(); }, [ym, settings]); // settings มาช้ากว่าแท็บได้ — โหลดใหม่เมื่อค่าเวลางาน/โหมด OT มาถึง
  const scoreColor = (s) => s == null ? "var(--ink-3)" : s >= 80 ? "var(--up)" : s >= 60 ? "#d97706" : "var(--down)";
  return (
    <div className="card">
      <div className="sec-head">
        <div><div className="sec-title">ประสิทธิผลพนักงาน · {ym}</div><div className="sec-sub">คะแนน = ตรงเวลา + มาทำงาน + คะแนนงานของทีม − เคลม · (OT/เลื่อนนัด = ข้อมูลประกอบ ไม่คิดคะแนน) · <b>👆 คลิกชื่อพนักงานเพื่อดู KPI ตามตำแหน่ง</b></div></div>
        <input className="inp" type="month" value={ym} onChange={(e) => setYm(e.target.value)} style={{ width: 160 }} />
      </div>
      {loading ? <div className="empty">กำลังคำนวณ…</div> : !rows.length ? <div className="empty">ไม่มีข้อมูล</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="hr-table">
            <thead><tr><th style={{ textAlign: "left" }}>พนักงาน</th><th>ทีม</th><th>มา/ขาด/ลา</th><th>สาย</th><th>ตรงเวลา</th><th>OT(ชม.)</th><th>งานเสร็จ(ทีม)</th><th>คะแนนงาน</th><th>เคลม</th><th>เลื่อนนัด</th><th>คะแนนรวม</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.p.id}>
                  <td style={{ textAlign: "left" }}><button type="button" onClick={() => setKpiDetail(r)} title="ดู KPI ตามตำแหน่ง" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textAlign: "left" }}><b style={{ borderBottom: "1px dotted var(--ink-3)" }}>{r.p.name || r.p.email}</b> 🎯</button></td>
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
      <p className="page-sub" style={{ marginTop: 10 }}>* งาน/คะแนน/เคลม นับจากงานของ “ทีม” ที่พนักงานสังกัด (นับจากรอบนัด job_visits ด้วย ไม่ใช่แค่ทีมระดับใบ) · คะแนนรวม = ตรงเวลา 50% + มาทำงาน 20% + คะแนนงาน 30% − เคลม×5 (หมวดที่ไม่มีข้อมูลจะถูกตัดออกแล้วเฉลี่ยใหม่) · <b>ตรงเวลา = สัดส่วนวันมาตรงเวลาจากวันที่มาทำงาน · OT/เลื่อนนัด แสดงเป็นข้อมูลประกอบ ไม่คิดคะแนน · OT ดึงจากใบขอที่อนุมัติ+เช็คเอาท์</b></p>
      {kpiDetail && <KpiDetailModal r={kpiDetail} ym={ym} onClose={() => setKpiDetail(null)} />}
    </div>
  );
}

// ---------- KPI ตามตำแหน่ง (จากคู่มือ handbook) + เติมค่าจริงที่วัดได้จากข้อมูลในหน้าประสิทธิผล ----------
// คืน { txt, tone: "ok"|"bad"|"warn"|"neutral", auto:true } ถ้าวัดค่าจริงได้ · คืน null ถ้าเป็น KPI ที่วัดเอง/นอกระบบ
function kpiActual(k, r) {
  const key = `${k.m || ""} ${k.src || ""}`;
  const on = r.onTime;                                  // % ตรงเวลา (จากเข้างาน)
  const attRatio = (r.st.present + r.st.absent) > 0 ? Math.round(r.st.present / (r.st.present + r.st.absent) * 100) : null;
  if (/ตรงเวลา|เข้างาน|มาตรงเวลา|สาย/.test(key) && /เข้างาน|ลา|ตรงเวลา|สาย/.test(key)) {
    if (on != null) return { txt: on + "%", tone: on >= 95 ? "ok" : on >= 85 ? "warn" : "bad", auto: true };
  }
  if (/มาทำงาน|ขาดงาน|เข้างานครบ/.test(key) && attRatio != null) return { txt: attRatio + "%", tone: attRatio >= 95 ? "ok" : attRatio >= 85 ? "warn" : "bad", auto: true };
  if (/เคลม|แก้ซ้ำ/.test(key)) return { txt: `${r.m.claims} ครั้ง`, tone: r.m.claims === 0 ? "ok" : "bad", auto: true };
  if (/คะแนน|ดาว|รีวิว|ความพึงพอใจ|ประเมิน/.test(key)) { if (r.avgRating != null) return { txt: `★ ${r.avgRating.toFixed(1)}`, tone: r.avgRating >= 4 ? "ok" : r.avgRating >= 3 ? "warn" : "bad", auto: true }; }
  if (/งานเสร็จ|จำนวนงาน|งานต่อวัน|ปริมาณงาน/.test(key)) return { txt: `${r.m.done} งาน (ทีม)`, tone: "neutral", auto: true };
  if (/เลื่อนนัด|เลื่อน/.test(key)) return { txt: `${r.m.resched} ครั้ง`, tone: r.m.resched === 0 ? "ok" : "warn", auto: true };
  if (/OT|ล่วงเวลา/.test(key)) return { txt: `${(r.otHours || 0).toFixed(1)} ชม.`, tone: "neutral", auto: true };
  return null;   // วัดเอง/นอกระบบ (เช่น ยอดขาย, DSO, checklist) — โชว์เป้า + เมนูที่ต้องไปวัด
}

function KpiDetailModal({ r, ym, onClose }) {
  const g = ROLE_GUIDE[r.p.role];
  const c = (g && DEPT_COLOR[g.dept]) || "#0d9488";
  const toneColor = { ok: "var(--up)", bad: "var(--down)", warn: "#d97706", neutral: "var(--ink-2)" };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-head"><div className="modal-title">🎯 KPI ตามตำแหน่ง · {r.p.name || r.p.email}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body" style={{ overflowY: "auto" }}>
          {!g ? <div className="empty">ตำแหน่งนี้ยังไม่มี KPI ในคู่มือ</div> : (<>
            <div className="jo-dim" style={{ fontSize: 13, marginBottom: 10 }}>{g.icon} <b style={{ color: c }}>{g.th}</b> · รอบ {ym} · <span style={{ color: "var(--up)" }}>●</span> ผ่าน <span style={{ color: "var(--down)" }}>●</span> ต่ำกว่าเป้า · ค่าที่ระบบวัดให้มีป้าย “ระบบ”, ที่เหลือหัวหน้าประเมินเองจากเมนูที่ระบุ</div>
            {g.kpis.map((k, i) => { const a = kpiActual(k, r); return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <span style={{ fontFamily: "monospace", fontSize: 10.5, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 5, padding: "1px 5px", flex: "none", marginTop: 2 }}>K{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.8, fontWeight: 600 }}>{k.m}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>🎯 เป้า {k.t} · ⏱ {k.f} · 📍 {k.src}{k.w ? ` · น้ำหนัก ${k.w}%` : ""}</div>
                </div>
                <div style={{ textAlign: "right", flex: "none", minWidth: 92 }}>
                  {a ? <>
                    <div style={{ fontWeight: 800, fontSize: 14, color: toneColor[a.tone] }}>{a.txt}</div>
                    <div style={{ fontSize: 10, color: "var(--ink-3)" }}>🟢 ระบบวัดให้</div>
                  </> : <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>ประเมินเอง<br /><span style={{ fontSize: 10 }}>ดูที่ “{k.src}”</span></div>}
                </div>
              </div>
            ); })}
            <div style={{ marginTop: 12, background: "var(--surface-2, #f3f7f8)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "var(--ink-2)" }}>
              <b>คะแนนรวมงวดนี้: {r.comp != null ? r.comp : "—"}</b> · สรุปจาก ตรงเวลา {r.onTime != null ? r.onTime + "%" : "—"} · มา/ขาด/ลา {r.st.present}/{r.st.absent}/{r.st.leaveDays} · คะแนนงานทีม {r.avgRating != null ? "★ " + r.avgRating.toFixed(1) : "—"} · เคลม {r.m.claims}
            </div>
          </>)}
        </div>
        <div className="modal-foot"><button className="btn-primary" onClick={onClose}>ปิด</button></div>
      </div>
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
  const [adj, setAdj] = React.useState({});     // user_id → { bonus, other_deduct, water, electric }
  const [otByUser, setOtByUser] = React.useState({});     // user_id → OT ชม.ที่อนุมัติในรอบ (mig 184)
  const [otIdsByUser, setOtIdsByUser] = React.useState({}); // user_id → [ot ids] to settle
  const [otRowsByUser, setOtRowsByUser] = React.useState({}); // user_id → [ot rows] ไว้กางดูรายละเอียด (เลขงาน+รายละเอียด)
  const [loanByUser, setLoanByUser] = React.useState({});   // user_id → งวดผ่อนเงินยืมรอบนี้
  const [loanItemsByUser, setLoanItemsByUser] = React.useState({}); // user_id → [{id, amount}] to settle
  const [advByUser, setAdvByUser] = React.useState({});   // user_id → approved-unsettled advance total
  const [advIdsByUser, setAdvIdsByUser] = React.useState({}); // user_id → [advance ids] to settle on pay
  const [advRowsByUser, setAdvRowsByUser] = React.useState({}); // user_id → [advance rows] ไว้กางดูรายละเอียด
  const [detailFor, setDetailFor] = React.useState(null); // แถวที่กดดูรายละเอียดรายวัน (r)
  const [pendingHol, setPendingHol] = React.useState([]);   // งานวันหยุดที่ยังไม่กดรับรองในรอบนี้ (mig 191) — กันลืมแล้วพนักงานเสียค่าวันหยุดเงียบ ๆ
  const [noOut, setNoOut] = React.useState([]);           // วันที่เช็คอินแล้วไม่มีเวลาออก ทั้งรอบ — กันทั้งจ่ายเกิน (รายวัน) และจ่ายขาด (ค่าวันหยุด)
  const [attEdit, setAttEdit] = React.useState(null);     // { p, a, day } → เปิดโมดัลใส่เวลาออกจากแบนเนอร์ได้เลย
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [company, setCompany] = React.useState({});
  const [printSlip, setPrintSlip] = React.useState(null); // { row, calc } for the off-screen payslip
  const [printAll, setPrintAll] = React.useState(false);  // พิมพ์สลิปทุกคนในรอบทีเดียว (เก็บเป็นชุด)
  const [payModal, setPayModal] = React.useState(false);  // จ่ายทั้งรอบ: เลือกบัญชี + สลิปโอน
  const [dmBusy, setDmBusy] = React.useState(null);       // user_id ที่กำลังส่งสลิป DM
  const printWin = React.useRef(null);
  const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const payDate = `${ym}-${pad(lastDay)}`;
  React.useEffect(() => { getCompanies().then((co) => setCompany((co?.vat && Object.keys(co.vat).length ? co.vat : co?.novat) || {})).catch(() => {}); }, []);
  React.useEffect(() => { if (!printSlip && !printAll) return; const t = setTimeout(() => { writeAndPrint(printWin.current); printWin.current = null; setPrintSlip(null); setPrintAll(false); }, 200); return () => clearTimeout(t); }, [printSlip, printAll]);

  async function load() {
    setLoading(true);
    try {
      const [att, leaves, slips, advs, qOverRows, otAll, loansActive] = await Promise.all([listAttendance(from, to), listLeaves("approved"), listPayslips(ym), listAdvances("approved"), getLeaveQuotas(ym.slice(0, 4)).catch(() => []), listOt().catch(() => []), listLoans(true).catch(() => [])]);
      // OT: คิดจากใบขอที่อนุมัติในรอบนี้ (mig 184) — ผลรวมชั่วโมง + ไอดีไว้ปิดตอนจ่าย
      const otH = {}, otIdByUser = {}, otRows = {};
      // นับเฉพาะที่เช็คเอาท์แล้ว (hours>0) — อนุมัติแต่ยังไม่เช็คเอาท์จะยังไม่คิดเงิน/ไม่ถูกปิด (mig 186)
      (otAll || []).filter((o) => o.ot_date >= from && o.ot_date <= to && o.status === "approved" && Number(o.hours) > 0).forEach((o) => { otH[o.user_id] = (otH[o.user_id] || 0) + (Number(o.hours) || 0); (otIdByUser[o.user_id] = otIdByUser[o.user_id] || []).push(o.id); });
      Object.keys(otH).forEach((k) => { otH[k] = Math.round(otH[k] * 100) / 100; });
      // รายการ OT ที่เข้าเงินเดือนรอบนี้ (อนุมัติ+เช็คเอาท์ หรือ จ่ายปิดแล้วในรอบนี้) — ไว้กางรายละเอียดพร้อมเลขงาน
      (otAll || []).filter((o) => o.ot_date >= from && o.ot_date <= to && ((o.status === "approved" && Number(o.hours) > 0) || (o.status === "paid" && o.period === ym))).forEach((o) => { (otRows[o.user_id] = otRows[o.user_id] || []).push(o); });
      setOtByUser(otH); setOtIdsByUser(otIdByUser); setOtRowsByUser(otRows);
      // เงินยืม: งวดผ่อนรอบนี้ = min(ค่างวด, คงเหลือ) ต่อคน (active)
      const loanH = {}, loanItByUser = {};
      (loansActive || []).filter((l) => l.status === "active" && Number(l.balance) > 0).forEach((l) => { const amt = Math.min(Number(l.installment) || 0, Number(l.balance) || 0); if (amt > 0) { loanH[l.user_id] = (loanH[l.user_id] || 0) + amt; (loanItByUser[l.user_id] = loanItByUser[l.user_id] || []).push({ id: l.id, amount: amt }); } });
      setLoanByUser(loanH); setLoanItemsByUser(loanItByUser);
      // โควตาลารายคน (HR ตั้งเองใน กะ & ตั้งค่า) — ต้องใช้คิดหักลาเกินให้ตรงกับการ์ดยอดคงเหลือ ไม่งั้นจอบอกเหลือ 2 วันแต่หักเงินเหมือนเกินโควตา
      const qOver = Object.fromEntries((qOverRows || []).map((r) => [r.user_id, r]));
      // approved advances not yet settled (period not set) → deduct in this run
      const advSum = {}, advIds = {}, advRows = {};
      advs.filter((a) => !a.period).forEach((a) => { advSum[a.user_id] = (advSum[a.user_id] || 0) + (Number(a.amount) || 0); (advIds[a.user_id] = advIds[a.user_id] || []).push(a.id); (advRows[a.user_id] = advRows[a.user_id] || []).push(a); });
      setAdvByUser(advSum); setAdvIdsByUser(advIds); setAdvRowsByUser(advRows);
      const attByUserDay = {}; att.forEach((a) => { (attByUserDay[a.user_id] = attByUserDay[a.user_id] || {})[a.work_date] = a; });
      // งานวันหยุดค้างรับรอง (mig 191): มาทำงานวันหยุด + เช็คเอาท์แล้ว แต่ยังไม่กด hol_ok → ค่าวันหยุดยังเป็น 0
      // รวบทั้งรอบมาไว้หน้าเดียว ให้ HR กดรับรองก่อนปิดรอบ (ไม่งั้นพนักงานเสียค่าวันหยุดเงียบ ๆ)
      const holPend = att
        .filter((a) => a.check_in_at && a.check_out_at && !a.hol_ok)
        .map((a) => ({ a, p: staff.find((x) => x.id === a.user_id) }))
        .filter(({ a, p }) => p && !isWorkday(a.work_date, p.work_pattern || "mon_sat", p.sat_group, holSet))
        .map(({ a, p }) => ({ a, name: p.name || p.email, hours: Math.round(Math.max(0, ((minutesOf(a.check_out_at) ?? 0) - (minutesOf(a.check_in_at) ?? 0))) / 60 * 10) / 10 }))
        .sort((x, y) => (x.a.work_date < y.a.work_date ? -1 : 1));
      setPendingHol(holPend);
      // วันที่เช็คอินแล้วไม่มีเวลาออก — สแกน "ทั้งรอบ" ไม่ใช่ 7 วันหลังแบบแบนเนอร์ในแท็บวันนี้
      const nOut = att.filter((a) => a.check_in_at && !a.check_out_at)
        .map((a) => ({ a, name: staff.find((p) => p.id === a.user_id)?.name || a.user_id }))
        .sort((x, y) => (x.a.work_date < y.a.work_date ? -1 : 1));
      setNoOut(nOut);
      const leaveDaySet = buildLeaveDaySet(leaves, from, to); const yr = ym.slice(0, 4);
      const quota = settings.quota || DEFAULT_HR_SETTINGS.quota;
      // ลาเกินโควตา: หักเฉพาะ "ส่วนเกินที่เกิดขึ้นในรอบนี้" = (สะสมถึงปลายรอบ เกินโควตาเท่าไหร่) − (สะสมถึงก่อนต้นรอบ เกินอยู่แล้วเท่าไหร่) แยกรายประเภท
      // — สูตรเดิมใช้ยอดเกินสะสมทั้งปี ทำให้เดือนถัด ๆ มาโดนหักซ้ำทุกเดือนที่มีการลา และประเภทที่ยังไม่เกินโดนลูกหลง
      const yearStart = `${yr}-01-01`;
      const dayBefore = (s) => { const d = hrParseYmd(s); d.setDate(d.getDate() - 1); return hrYmd(d); };
      const usedThru = (uid, t, cutoff) => leaves.reduce((s, l) => (l.user_id === uid && l.type === t) ? s + leaveDaysInRange(l, yearStart, cutoff) : s, 0);
      const slipBy = Object.fromEntries(slips.map((s) => [s.user_id, s]));
      setPaidStatus(slips.length && slips.every((s) => s.status === "paid") ? "paid" : "draft");
      const initAdj = {};
      const result = staff.map((p) => {
        const st = periodStats(p, attByUserDay, leaveDaySet, from, to, holSet, settings);
        st.otHours = otH[p.id] || 0; st.otMin = Math.round(st.otHours * 60);   // OT จากใบขอที่อนุมัติ (mig 184)
        let over = 0;
        ["vacation", "personal", "sick"].forEach((t) => {
          const q = (qOver[p.id]?.[t] ?? quota[t]) ?? 0;
          over += Math.max(0, usedThru(p.id, t, to) - q) - Math.max(0, usedThru(p.id, t, dayBefore(from)) - q);
        });
        // หักค่าแรง = ส่วนเกินโควตาที่เกิดในรอบนี้ + ลาไม่รับค่าแรงทั้งหมดในรอบ (เต็มวัน/ราย ชม. คิดเศษวัน)
        st.overLeave = Math.round((Math.min(st.leaveDays - (st.unpaidLeave || 0), Math.max(0, over)) + (st.unpaidLeave || 0)) * 100) / 100;
        const slip = slipBy[p.id];
        initAdj[p.id] = { bonus: Number(slip?.bonus) || 0, other_deduct: Number(slip?.other_deduct) || 0, water: Number(slip?.d_water) || 0, electric: Number(slip?.d_electric) || 0 };
        return { p, st, slip };
      });
      setAdj(initAdj); setRows(result);
    } catch (e) { flash("คำนวณไม่สำเร็จ: " + (e.message || e) + " (รัน 051_payroll.sql แล้วหรือยัง?)", true); setRows([]); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, [ym, settings]); // settings มาช้ากว่าแท็บได้ — โหลดใหม่เมื่อค่าเวลางาน/โหมด OT มาถึง

  // รอบที่จ่ายแล้วอ่านจากสลิปที่บันทึก — สูตรอยู่ที่ lib/payroll.js frozenPayslip() ใช้ร่วมกับหน้า เข้างาน/ลา

  const calcOf = (r) => (r.slip?.status === "paid" ? frozenPayslip(r.slip)
    : computePayslip({ ...r.p, bonus: adj[r.p.id]?.bonus || 0, other_deduct: adj[r.p.id]?.other_deduct || 0, advance: advByUser[r.p.id] || 0,
        loan: loanByUser[r.p.id] || 0, water: adj[r.p.id]?.water || 0, electric: adj[r.p.id]?.electric || 0 }, r.st, {}));
  // ---- export CSV ราชการ (BOM นำหน้าให้ Excel อ่านไทยถูก) ----
  const dlCsv = (name, rowsArr) => { const csv = "﻿" + rowsArr.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); };
  function exportSso() {
    const rs = payable.map((r) => ({ r, c: calcOf(r) })).filter((x) => x.c.dSso > 0);
    if (!rs.length) return flash("ไม่มีพนักงานที่หักประกันสังคมในรอบนี้ (ติ๊ก 'ประกันสังคม' ในแท็บ กะ & ตั้งค่า)", true);
    dlCsv(`sso-${ym}.csv`, [["ลำดับ", "ชื่อ-สกุล", "เลขบัตรประชาชน", "ค่าจ้างฐานคำนวณ (เพดาน 17,500)", "เงินสมทบพนักงาน 5%", "เงินสมทบนายจ้าง 5%", "รวมนำส่ง"],
      ...rs.map((x, i) => { const wage = Math.min(x.r.p.pay_type === "daily" ? x.c.base : Number(x.r.p.base_pay) || 0, 17500); return [i + 1, x.r.p.name || x.r.p.email, x.r.p.citizen_id || "", wage, x.c.dSso, x.c.dSso, x.c.dSso * 2]; }),
      ["", "รวม", "", "", rs.reduce((a, x) => a + x.c.dSso, 0), rs.reduce((a, x) => a + x.c.dSso, 0), rs.reduce((a, x) => a + x.c.dSso * 2, 0)]]);
    flash("ดาวน์โหลดไฟล์ ปกส. แล้ว ✓ (เลขบัตร ปชช. เติมได้ในแท็บ กะ & ตั้งค่า)");
  }
  function exportPnd() {
    const rowsP = payable.map((r, i) => { const c = calcOf(r); return [i + 1, r.p.name || r.p.email, r.p.citizen_id || "", c.gross, c.dTax || 0, c.net]; });
    // ไม่มีใครตั้งยอดภาษีเลย → บอกตรง ๆ ว่าไฟล์จะเว้นช่องภาษีว่าง ดีกว่าปล่อยให้เข้าใจว่าไม่มีใครต้องเสีย
    if (!rowsP.some((x) => Number(x[4]) > 0)) flash("ยังไม่ได้ตั้งยอดภาษีหัก ณ ที่จ่ายรายคน (แท็บ กะ & ตั้งค่า) — ช่องภาษีในไฟล์จะเป็น 0", true);
    dlCsv(`pnd1-${ym}.csv`, [["ลำดับ", "ชื่อ-สกุล", "เลขบัตรประชาชน", "เงินได้รอบนี้ (ก่อนหัก)", "ภาษีหัก ณ ที่จ่าย", "จ่ายสุทธิ"], ...rowsP]);
    flash("ดาวน์โหลดสรุปยื่น ภงด.1 แล้ว ✓");
  }
  // ---- ส่งสลิปเงินเดือนเข้าแชตส่วนตัว (DM) รายคน — การ์ดรูปเหมือนสลิปพิมพ์ + สลิปโอนของรอบ ----
  async function sendSlipDm(r, c) {
    setDmBusy(r.p.id);
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const line = (l, v, neg) => (v ? `<tr><td style="padding:5px 10px">${l}</td><td style="padding:5px 12px;text-align:right;font-weight:700;color:${neg ? "#b91c1c" : "#0f1729"}">${neg ? "−" : ""}${fmtBaht(v)}</td></tr>` : "");
    const html = `<div style="width:460px;background:#fff;font-family:'Sarabun','IBM Plex Sans Thai',sans-serif;color:#0f1729;padding:20px">
      <div style="font-size:17px;font-weight:800;border-bottom:2px solid #0ea5e9;padding-bottom:8px">${esc(company.name || "AMC AIR")} · สลิปเงินเดือน</div>
      <div style="font-size:12.5px;color:#475569;margin:6px 0">${esc(r.p.name || r.p.email)}${r.p.department ? " · " + esc(r.p.department) : ""} · รอบ ${ym} (${from} ถึง ${to})</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${line(r.p.pay_type === "daily" ? `ค่าแรง (${r.st.present} วัน)` : "เงินเดือน", c.base)}
        ${line(`ค่าล่วงเวลา OT (${c.otHours.toFixed(1)} ชม.)`, c.otPay)}
        ${line(c._frozen ? "ค่าทำงานวันหยุด" : `ค่าทำงานวันหยุด (${c.holNormHours} ชม.${c.holOtHours ? ` + OT ${c.holOtHours} ชม.×3` : ""})`, c.holPay)}
        ${line("โบนัส/เบี้ยเลี้ยง", c.bonus)}
        ${line("หักมาสาย", c.dLate, 1)}${line("หักขาดงาน", c.dAbsent, 1)}${line("หักลาเกินโควต้า/ลาไม่รับค่าแรง", c.dLeave, 1)}
        ${line("ประกันสังคม", c.dSso, 1)}${line("ภาษีหัก ณ ที่จ่าย", c.dTax, 1)}${line("หักเบิกล่วงหน้า", c.dAdvance, 1)}${line("หักเงินยืม", c.dLoan, 1)}${line("หักค่าน้ำ", c.dWater, 1)}${line("หักค่าไฟ", c.dElectric, 1)}${line("หักอื่น ๆ", c.otherDeduct, 1)}
        <tr><td style="padding:8px 10px;border-top:2px solid #0ea5e9;font-weight:800">รับสุทธิ</td><td style="padding:8px 12px;border-top:2px solid #0ea5e9;text-align:right;font-weight:800;font-size:16px;color:#0a6b3d">${fmtBaht(c.net)}</td></tr>
      </table></div>`;
    const host = document.createElement("div"); host.style.cssText = "position:fixed;left:-99999px;top:0;background:#fff;"; host.innerHTML = html; document.body.appendChild(host);
    try {
      if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
      await new Promise((res) => setTimeout(res, 60));
      const canvas = await html2canvas(host.firstElementChild, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      const url = await uploadChatImage(new File([blob], `payslip-${ym}.png`, { type: "image/png" }));
      const rid = await createDmRoom(r.p.id);
      await sendChatMessage(rid, `🧾 สลิปเงินเดือนรอบ ${ym} · รับสุทธิ ${fmtBaht(c.net)}`);
      await sendChatImage(rid, url);
      if (r.slip?.pay_slip_url) await sendChatImage(rid, r.slip.pay_slip_url);   // สลิปโอนเงินของรอบตามไปด้วย
      flash(`ส่งสลิปให้ ${r.p.name || "พนักงาน"} ทางแชตส่วนตัวแล้ว ✓`);
    } catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    document.body.removeChild(host);
    setDmBusy(null);
  }
  const setA = (id, k, v) => setAdj((s) => ({ ...s, [id]: { ...s[id], [k]: Number(v) || 0 } }));
  const payable = (rows || []).filter((r) => (Number(r.p.base_pay) || 0) > 0 || r.st.present > 0);
  // ยอดรวมทุกคอลัมน์ (แถวรวมท้ายตาราง)
  const colTot = payable.reduce((a, r) => { const c = calcOf(r); ["base", "otPay", "holPay", "dLate", "dAbsent", "dLeave", "dSso", "dTax", "dAdvance", "dLoan", "dWater", "dElectric", "bonus", "otherDeduct", "net"].forEach((k) => { a[k] = (a[k] || 0) + (Number(c[k]) || 0); }); return a; }, {});
  const totalNet = colTot.net || 0;

  async function saveRun(markPaid, meta) {
    setBusy(true);
    try {
      let runNet = 0, ledgerSkipped = false;
      // สลิปทั้งรอบบันทึกในคำสั่งเดียว (savePayslips) — กันเน็ตหลุดกลางทางแล้วได้รอบครึ่ง ๆ กลาง ๆ
      const rows = payable.map((r) => {
        const c = calcOf(r); runNet += c.net;
        return { period: ym, user_id: r.p.id, pay_type: r.p.pay_type || "monthly",
          base: c.base, ot_pay: c.otPay, hol_pay: c.holPay, present_days: r.st.present, absent_days: r.st.absent, leave_days: r.st.leaveDays, over_leave_days: r.st.overLeave,
          // ⚠️ เก็บนาที OT "ที่จ่ายจริง" (ปัดครึ่ง ชม.แล้ว = c.otHours) ไม่ใช่นาทีดิบ r.st.otMin
          //    frozenPayslip อ่าน ot_min/60 กลับมาโชว์ชั่วโมง ถ้าเก็บดิบ สลิปจะโชว์ ชม.มากกว่าที่จ่าย (3.3 ชม. × 60 ≠ 150)
          late_min: r.st.lateMin, ot_min: Math.round((c.otHours || 0) * 60), d_late: c.dLate, d_absent: c.dAbsent, d_leave: c.dLeave, d_sso: c.dSso, d_advance: c.dAdvance,
          d_loan: c.dLoan || 0, d_water: c.dWater || 0, d_electric: c.dElectric || 0,   // เงินยืม/ค่าน้ำ/ค่าไฟ (mig 184)
          bonus: c.bonus, other_deduct: c.otherDeduct, d_tax: c.dTax || 0, net: c.net, status: markPaid ? "paid" : "draft" };
      });
      await savePayslips(rows);
      if (markPaid) {
        await setPayslipPaid(ym, true, meta || {});
        // settle the advances deducted this run so they aren't deducted again next month
        // ⚠️ ปิดเฉพาะคนที่หักได้ครบจริง — ถ้าเงินไม่พอหัก (advanceCarry > 0) ต้องคงใบไว้ให้ยกไปหักรอบหน้า
        const ids = payable.filter((r) => !(calcOf(r).advanceCarry > 0)).flatMap((r) => advIdsByUser[r.p.id] || []);
        await markAdvancesPaid(ym, ids);
        // ปิด OT ที่อนุมัติ (→ paid) + บันทึกงวดผ่อนเงินยืม (ลด balance) ของคนที่จ่ายรอบนี้ (mig 184)
        await markOtPaid(ym, payable.flatMap((r) => otIdsByUser[r.p.id] || [])).catch(() => {});
        await markLoanPaid(ym, payable.flatMap((r) => loanItemsByUser[r.p.id] || [])).catch(() => {});
        const carried = payable.filter((r) => calcOf(r).advanceCarry > 0);
        if (carried.length) flash(`⚠️ ${carried.length} คนเบิกล่วงหน้าเกินยอดที่หักได้ในรอบนี้ — ใบเบิกยังค้างไว้ ยกไปหักรอบถัดไปให้อัตโนมัติ`, true);
        // เดินบัญชี: เงินเดือนทั้งรอบ = เงินออกจากบัญชีที่เลือก (best-effort — hr อาจไม่มีสิทธิ์)
        // booked === false = รอบนี้มีแถวเดินบัญชีเดิมที่กระทบแบงค์ (✓) ค้างอยู่ ระบบไม่ทับ — ต้องเตือนให้ไปตรวจเอง
        if (meta?.accountId) { const booked = await bookSalaryEntry(ym, meta.accountId, runNet, meta.payDate || payDate, payable.length).catch(() => null); ledgerSkipped = booked === false; }
        // link to Cash Flow: projected outflow on the month's pay date (วันสิ้นเดือน) — best-effort
        // (ฝ่ายบุคคล/hr อาจไม่มีสิทธิ์เขียนกระแสเงินสด → ปล่อยให้บัญชีซิงค์ทีหลังได้ ไม่บล็อกการจ่าย)
        await upsertPayrollCashEntry(ym, runNet, meta?.payDate || payDate, payable.length).catch(() => {});
      }
      flash(markPaid
        ? (ledgerSkipped ? "บันทึก + ทำจ่ายเงินเดือนแล้ว ✓ · ⚠️ รอบนี้มีรายการเดินบัญชีเดิมที่กระทบแบงค์ (✓) ค้างอยู่ — ยอดใหม่ไม่ถูกลงเดินบัญชี ไปตรวจ/ปลดกระทบที่เมนูเบิกจ่ายก่อน" : "บันทึก + ทำจ่ายเงินเดือนแล้ว ✓ (ลงเดินบัญชี + กระแสเงินสด)")
        : "บันทึกรอบเงินเดือนแล้ว ✓", markPaid && ledgerSkipped); await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  // cancel a paid run → revert slips to draft, un-settle the advances, remove the cash-flow line; redo anytime
  async function cancelPay() {
    // กติกาเดียวกับเอกสารขาย: ยกเลิกต้องระบุเหตุผลเสมอ — ลง audit log ไว้ตรวจย้อนหลัง
    const reason = await confirmDialog({ title: `ยกเลิกการจ่ายเงินเดือนรอบ ${ym}?`,
      message: "• สลิปกลับเป็นฉบับร่าง (แก้ไข/คำนวณใหม่ได้)\n• ยอดเบิกล่วงหน้าที่หักไป คืนสภาพ\n• ลบรายการในกระแสเงินสด",
      confirmText: "ยกเลิกจ่าย", prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น เวลาเข้างานผิด · ลืมหักเบิก", required: true } });
    if (reason === false) return;
    setBusy(true);
    try {
      await logAudit({ action: "cancel_pay", target_type: "payroll", target_no: ym, reason }).catch(() => {});
      await setPayslipPaid(ym, false);
      await unsettleAdvances(ym);
      await unsettleOt(ym).catch(() => {});      // คืน OT ที่ปิดไปให้ approved (mig 184)
      await unsettleLoan(ym).catch(() => {});    // คืนงวดผ่อนเงินยืม + balance กลับ
      await removeSalaryEntry(ym).catch(() => {});        // ลบรายการเดินบัญชีของรอบ (best-effort)
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
              <button className="btn-primary sm ok" disabled={busy || !payable.length} onClick={() => setPayModal(true)}>ทำจ่ายทั้งรอบ</button>
            </>
          )}
          <button className="btn-ghost sm" disabled={!payable.length} title="ไฟล์นำส่งประกันสังคม สปส.1-10 (CSV เปิดใน Excel)" onClick={exportSso}>⬇ ปกส.</button>
          <button className="btn-ghost sm" disabled={!payable.length} title="สรุปเงินได้รอบเดือนสำหรับยื่น ภงด.1 (CSV)" onClick={exportPnd}>⬇ ภงด.1</button>
          <button className="btn-ghost sm" disabled={!payable.length} title="พิมพ์สลิปเงินเดือนทุกคนในรอบทีเดียว (เก็บเป็น PDF ได้)" onClick={() => { printWin.current = openPrintWindow(); setPrintAll(true); }}>🖨️ พิมพ์สลิปทั้งรอบ</button>
        </div>
      </div>
      {!loading && noOut.length > 0 && paidStatus !== "paid" && (
        <div style={{ border: "1.5px solid #dc2626", background: "#fef2f2", borderRadius: 12, padding: "9px 12px", marginBottom: 12 }}>
          <div style={{ fontWeight: 800, color: "#b91c1c", marginBottom: 4 }}>
            ⏰ ยังไม่มีเวลาออก {noOut.length} วันในรอบนี้ — กดที่วันเพื่อใส่เวลาออกก่อนปิดรอบ
          </div>
          <div className="jo-dim" style={{ marginBottom: 6 }}>
            วันเหล่านี้ระบบยังนับว่า “มาทำงานเต็มวัน” — พนักงานรายวันจะได้ค่าแรงเต็มทั้งที่อาจอยู่ไม่ครบ
            และถ้าเป็นวันหยุด ค่าทำงานวันหยุดจะถูกคิดเป็น 0 (พนักงานเสียเงินฟรี)
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {noOut.map((x) => (
              <button key={x.a.user_id + x.a.work_date} className="cat-chip" style={{ borderColor: "#fca5a5", color: "#b91c1c" }}
                onClick={() => setAttEdit({ p: staff.find((s) => s.id === x.a.user_id) || { id: x.a.user_id, name: x.name }, a: x.a, day: x.a.work_date })}>
                {x.name} · {x.a.work_date.slice(5)}
              </button>
            ))}
          </div>
        </div>
      )}
      {attEdit && <AttEditModal day={attEdit.day} row={{ p: attEdit.p, a: attEdit.a }} flash={flash}
        onClose={() => setAttEdit(null)} onSaved={() => { setAttEdit(null); load(); }} />}
      {!loading && pendingHol.length > 0 && paidStatus !== "paid" && (
        <div style={{ border: "1.5px solid #f59e0b", background: "#fffbeb", borderRadius: 12, padding: "9px 12px", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: "#b45309" }}>🏖️ งานวันหยุดรอรับรอง {pendingHol.length} วัน — วันที่ยังไม่รับรอง ค่าวันหยุดจะยังไม่ถูกคิดเงินในรอบนี้</span>
            <button className="btn-primary sm ok" disabled={busy} onClick={async () => {
              if (!await confirmDialog(`รับรองงานวันหยุดทั้งหมด ${pendingHol.length} วัน?`)) return;
              setBusy(true);
              try { for (const x of pendingHol) await setAttendanceHolOk(x.a.user_id, x.a.work_date, true); flash("รับรองงานวันหยุดทั้งหมดแล้ว ✓"); await load(); }
              catch (e) { flash("ไม่สำเร็จ: " + (e.message || e) + " (รัน migration 191 แล้วหรือยัง?)", true); }
              setBusy(false);
            }}>✓ รับรองทั้งหมด</button>
          </div>
          <div className="jo-dim" style={{ marginBottom: 6 }}>ตรวจก่อนรับรองว่ามาทำงานจริงในวันหยุด (ไม่ใช่แค่แวะเข้ามา) — รับรองแยกรายวันได้ที่ปุ่มด้านล่าง หรือในแท็บ “วันนี้” (เลือกวันที่)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pendingHol.map((x) => (
              <button key={x.a.id} className="btn-ghost sm" style={{ borderColor: "#f59e0b" }} disabled={busy} title="กดเพื่อรับรองงานวันหยุดวันนี้วันเดียว"
                onClick={async () => { try { await setAttendanceHolOk(x.a.user_id, x.a.work_date, true); flash(`รับรองวันหยุด ${x.name} ✓`); await load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }}>
                {x.name} · {thDate(x.a.work_date)} · {x.hours} ชม.
              </button>
            ))}
          </div>
        </div>
      )}
      {loading ? <div className="empty">กำลังคำนวณ…</div> : payable.length === 0 ? <div className="empty">ยังไม่มีพนักงานที่ตั้งฐานเงินเดือน — ไปตั้งที่แท็บ “กะ & ตั้งค่า”</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="hr-table pay-table">
            <thead><tr><th style={{ textAlign: "left" }}>พนักงาน</th><th>ฐาน</th><th>OT (ชม.)</th><th>ค่าวันหยุด</th><th>หักสาย</th><th>หักขาด</th><th>หักลาเกิน</th><th>ปกส.</th><th>ภาษี</th><th>หักเบิกล่วงหน้า</th><th>เงินยืม</th><th>ค่าน้ำ</th><th>ค่าไฟ</th><th>โบนัส</th><th>หักอื่นๆ</th><th>สุทธิ</th><th>สลิป</th></tr></thead>
            <tbody>
              {payable.map((r) => { const c = calcOf(r); const openD = { onClick: () => setDetailFor(r), style: { cursor: "zoom-in" }, title: "กดดูรายละเอียดรายวัน" }; return (
                <tr key={r.p.id}>
                  <td style={{ textAlign: "left", cursor: "zoom-in" }} onClick={() => setDetailFor(r)} title="กดดูรายละเอียดรายวัน"><b>{r.p.name || r.p.email}</b><div className="jo-dim">{r.p.pay_type === "daily" ? `รายวัน · มา ${r.st.present} วัน` : "รายเดือน"}{r.st.absent ? ` · ขาด ${r.st.absent}` : ""}{r.st.lateMin ? ` · สาย ${Math.round(r.st.lateMin)} น.` : ""}{r.st.holidayDays ? <b style={{ color: "#b45309" }}> · 🔶 ทำงานวันหยุด {r.st.holidayDays} วัน ({r.st.holidayHours} ชม.)</b> : ""}</div></td>
                  <td {...openD}>{fmtBaht(c.base)}</td>
                  <td className="hr-ok" {...openD}>{c.otHours ? `${c.otHours.toFixed(1)} = ${fmtBaht(c.otPay)}` : "—"}</td>
                  <td className="hr-ok" {...openD}>{c.holPay ? fmtBaht(c.holPay) : "—"}</td>
                  <td className={c.dLate ? "hr-bad" : ""} {...openD}>{c.dLate ? "−" + fmtBaht(c.dLate) : "—"}</td>
                  <td className={c.dAbsent ? "hr-bad" : ""} {...openD}>{c.dAbsent ? "−" + fmtBaht(c.dAbsent) : "—"}</td>
                  <td className={c.dLeave ? "hr-bad" : ""} {...openD}>{c.dLeave ? "−" + fmtBaht(c.dLeave) : "—"}</td>
                  <td className={c.dSso ? "hr-bad" : ""} {...openD}>{c.dSso ? "−" + fmtBaht(c.dSso) : "—"}</td>
                  <td className={c.dTax ? "hr-bad" : ""} {...openD}>{c.dTax ? "−" + fmtBaht(c.dTax) : "—"}</td>
                  <td className={c.dAdvance ? "hr-bad" : ""} {...openD}>{c.dAdvance ? "−" + fmtBaht(c.dAdvance) : "—"}</td>
                  <td className={c.dLoan ? "hr-bad" : ""} {...openD} title="งวดผ่อนเงินยืมรอบนี้ (อัตโนมัติ)">{c.dLoan ? "−" + fmtBaht(c.dLoan) : "—"}</td>
                  <td><span className="inp inp-unit pay-adj"><span className="unit-pre">฿</span><input type="number" value={adj[r.p.id]?.water || 0} onChange={(e) => setA(r.p.id, "water", e.target.value)} /></span></td>
                  <td><span className="inp inp-unit pay-adj"><span className="unit-pre">฿</span><input type="number" value={adj[r.p.id]?.electric || 0} onChange={(e) => setA(r.p.id, "electric", e.target.value)} /></span></td>
                  <td><span className="inp inp-unit pay-adj"><span className="unit-pre">฿</span><input type="number" value={adj[r.p.id]?.bonus || 0} onChange={(e) => setA(r.p.id, "bonus", e.target.value)} /></span></td>
                  <td><span className="inp inp-unit pay-adj"><span className="unit-pre">฿</span><input type="number" value={adj[r.p.id]?.other_deduct || 0} onChange={(e) => setA(r.p.id, "other_deduct", e.target.value)} /></span></td>
                  <td style={{ fontWeight: 800, color: "var(--up)", cursor: "zoom-in" }} onClick={() => setDetailFor(r)} title="กดดูรายละเอียดรายวัน">{fmtBaht(c.net)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn-ghost sm" title="พิมพ์สลิป" onClick={() => { printWin.current = openPrintWindow(); setPrintSlip({ row: r, calc: c }); }}><UIcon name="catalog" size={14} /></button>
                    {paidStatus === "paid" && <button className="btn-ghost sm" title="ส่งสลิปเข้าแชตส่วนตัวของพนักงาน" disabled={dmBusy === r.p.id} onClick={() => sendSlipDm(r, c)}>{dmBusy === r.p.id ? "…" : "📲"}</button>}
                  </td>
                </tr>
              ); })}
            </tbody>
            <tfoot><tr style={{ fontWeight: 700 }}>
              <td style={{ textAlign: "left" }}>รวม ({payable.length} คน)</td>
              <td>{fmtBaht(colTot.base || 0)}</td>
              <td className="hr-ok">{colTot.otPay ? fmtBaht(colTot.otPay) : "—"}</td>
              <td className="hr-ok">{colTot.holPay ? fmtBaht(colTot.holPay) : "—"}</td>
              <td className={colTot.dLate ? "hr-bad" : ""}>{colTot.dLate ? "−" + fmtBaht(colTot.dLate) : "—"}</td>
              <td className={colTot.dAbsent ? "hr-bad" : ""}>{colTot.dAbsent ? "−" + fmtBaht(colTot.dAbsent) : "—"}</td>
              <td className={colTot.dLeave ? "hr-bad" : ""}>{colTot.dLeave ? "−" + fmtBaht(colTot.dLeave) : "—"}</td>
              <td className={colTot.dSso ? "hr-bad" : ""}>{colTot.dSso ? "−" + fmtBaht(colTot.dSso) : "—"}</td>
              <td className={colTot.dTax ? "hr-bad" : ""}>{colTot.dTax ? "−" + fmtBaht(colTot.dTax) : "—"}</td>
              <td className={colTot.dAdvance ? "hr-bad" : ""}>{colTot.dAdvance ? "−" + fmtBaht(colTot.dAdvance) : "—"}</td>
              <td className={colTot.dLoan ? "hr-bad" : ""}>{colTot.dLoan ? "−" + fmtBaht(colTot.dLoan) : "—"}</td>
              <td className={colTot.dWater ? "hr-bad" : ""}>{colTot.dWater ? "−" + fmtBaht(colTot.dWater) : "—"}</td>
              <td className={colTot.dElectric ? "hr-bad" : ""}>{colTot.dElectric ? "−" + fmtBaht(colTot.dElectric) : "—"}</td>
              <td className="hr-ok">{colTot.bonus ? fmtBaht(colTot.bonus) : "—"}</td>
              <td className={colTot.otherDeduct ? "hr-bad" : ""}>{colTot.otherDeduct ? "−" + fmtBaht(colTot.otherDeduct) : "—"}</td>
              <td style={{ fontWeight: 800 }}>{fmtBaht(totalNet)}</td>
              <td />
            </tr></tfoot>
          </table>
        </div>
      )}
      <p className="page-sub" style={{ marginTop: 10 }}>* ฐานรายเดือน = เงินเดือนเต็ม · ฐานรายวัน = วันที่มา × ค่าแรง/วัน · OT = ชม.OT × เรตที่ตั้ง · หักสาย/ขาด คิดจากเรตรายชั่วโมง/วัน · ปกส. 5% (เพดานฐาน 17,500 = สูงสุด 875) · แก้โบนัส/หักอื่นๆ ได้ในตาราง แล้วกด “บันทึกรอบ” · 🔶 <b>ค่าวันหยุด</b>คิดอัตโนมัติตามกฎหมาย: 8 ชม.แรก รายเดือน +1 เท่า / รายวัน 2 เท่า · เกิน 8 ชม. = OT วันหยุด 3 เท่า (หักพักเที่ยง 1 ชม. เมื่ออยู่เกิน 5 ชม.) · 🔍 <b>กดที่ช่องไหนก็ได้ในแถว</b> เพื่อดูรายละเอียดรายวัน (OT วันไหน/สายวันไหน/ขาดวันไหน ฯลฯ)</p>
      {paidStatus === "paid" && <p className="page-sub" style={{ marginTop: 6, color: "var(--down)", fontWeight: 600 }}>🔒 รอบนี้จ่ายแล้ว — ตัวเลขในตารางอัปเดตตามข้อมูลล่าสุดเสมอ แต่สลิปที่บันทึก + รายการกระแสเงินสด ถูกล็อกไว้ ณ ตอนจ่าย · ถ้าแก้เวลาเข้างาน/ลา/เบิกล่วงหน้า แล้วต้องการให้มีผลกับสลิปและกระแสเงินสด ให้กด “ยกเลิกจ่าย” แล้ว “ทำจ่ายทั้งรอบ” ใหม่</p>}

      {payModal && <PayRunModal total={totalNet} count={payable.length} defaultDate={payDate}
        onClose={() => setPayModal(false)} onConfirm={(meta) => { setPayModal(false); saveRun(true, meta); }} flash={flash} />}

      {detailFor && <PayDetailModal r={detailFor} c={calcOf(detailFor)} advRows={advRowsByUser[detailFor.p.id] || []} otRows={otRowsByUser[detailFor.p.id] || []}
        settings={settings} period={`${from} ถึง ${to}`} onClose={() => setDetailFor(null)} />}

      {printSlip && (
        <div className="print-area payslip-print">
          <SlipBody r={printSlip.row} c={printSlip.calc} company={company} ym={ym} from={from} to={to} payDate={payDate} />
        </div>
      )}
      {printAll && (
        <div className="print-area">
          {payable.map((r) => (
            <div className="payslip-print" style={{ pageBreakAfter: "always" }} key={r.p.id}>
              <SlipBody r={r} c={calcOf(r)} company={company} ym={ym} from={from} to={to} payDate={payDate} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// เนื้อสลิปเงินเดือน 1 ใบ (ใช้ทั้งพิมพ์รายคน + พิมพ์ทั้งรอบ)
function SlipBody({ r, c, company, ym, from, to, payDate }) {
  const p = r.p;
  return (<>
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
        {c.holPay > 0 && <tr><td>ค่าทำงานวันหยุด{c._frozen ? "" : ` (${c.holNormHours} ชม.${c.holOtHours ? ` + OT ${c.holOtHours} ชม.×3` : ""})`}</td><td className="r">{fmtBaht(c.holPay)}</td></tr>}
        {c.bonus > 0 && <tr><td>โบนัส/เบี้ยเลี้ยง</td><td className="r">{fmtBaht(c.bonus)}</td></tr>}
        <tr className="ps-sub"><td>รวมรายได้</td><td className="r">{fmtBaht(c.gross)}</td></tr>
        <tr className="ps-h"><td colSpan={2}>รายการหัก</td></tr>
        {c.dLate > 0 && <tr><td>หักมาสาย</td><td className="r">−{fmtBaht(c.dLate)}</td></tr>}
        {c.dAbsent > 0 && <tr><td>หักขาดงาน</td><td className="r">−{fmtBaht(c.dAbsent)}</td></tr>}
        {c.dLeave > 0 && <tr><td>หักลาเกินสิทธิ์/ลาไม่รับค่าแรง</td><td className="r">−{fmtBaht(c.dLeave)}</td></tr>}
        {c.dSso > 0 && <tr><td>ประกันสังคม 5%</td><td className="r">−{fmtBaht(c.dSso)}</td></tr>}
        {c.dAdvance > 0 && <tr><td>หักเบิกเงินล่วงหน้า</td><td className="r">−{fmtBaht(c.dAdvance)}</td></tr>}
        {c.dTax > 0 && <tr><td>ภาษีหัก ณ ที่จ่าย</td><td className="r">−{fmtBaht(c.dTax)}</td></tr>}
        {c.dLoan > 0 && <tr><td>หักเงินยืม</td><td className="r">−{fmtBaht(c.dLoan)}</td></tr>}
        {c.dWater > 0 && <tr><td>หักค่าน้ำ</td><td className="r">−{fmtBaht(c.dWater)}</td></tr>}
        {c.dElectric > 0 && <tr><td>หักค่าไฟ</td><td className="r">−{fmtBaht(c.dElectric)}</td></tr>}
        {c.otherDeduct > 0 && <tr><td>หักอื่นๆ</td><td className="r">−{fmtBaht(c.otherDeduct)}</td></tr>}
        <tr className="ps-sub"><td>รวมรายการหัก</td><td className="r">−{fmtBaht(c.ded)}</td></tr>
        <tr className="ps-net"><td>เงินได้สุทธิ</td><td className="r">{fmtBaht(c.net)}</td></tr>
      </tbody>
    </table>
    <div className="ps-att">สถิติงวดนี้: มา {r.st.present} · ขาด {r.st.absent} · ลา {r.st.leaveDays} · สาย {r.st.lateCnt} ครั้ง · OT {(r.st.otHours || 0).toFixed(1)} ชม.</div>
    <div className="ps-sign"><div>ลงชื่อ ........................ ผู้จ่ายเงิน</div><div>ลงชื่อ ........................ ผู้รับเงิน</div></div>
  </>);
}

// one editable salary row — controlled so saved values show clearly (and re-sync after reload)
// จ่ายเงินเดือนทั้งรอบ — เลือกบัญชี + วันที่ + แนบสลิปโอน (จำเป็น) เหมือนจ่ายช่างซัพ/เบิกล่วงหน้า
function PayRunModal({ total, count, defaultDate, onClose, onConfirm, flash }) {
  const [accounts, setAccounts] = React.useState(null);
  const [accountId, setAccountId] = React.useState("");
  const [payDate, setPayDate] = React.useState(defaultDate || new Date().toISOString().slice(0, 10));
  const [slipUrl, setSlipUrl] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  React.useEffect(() => { listAccounts().then((a) => { setAccounts(a); setAccountId((a.find((x) => x.kind === "bank") || a[0])?.id || ""); }).catch(() => setAccounts([])); }, []);
  async function onSlip(e) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { setSlipUrl(await uploadExpenseFile(f)); } catch (ex) { flash("อัปโหลดสลิปไม่สำเร็จ: " + (ex.message || ex), true); }
    setUploading(false); e.target.value = "";
  }
  function confirmPay() {
    if (!accountId) return flash("เลือกบัญชีที่จ่าย", true);
    if (!slipUrl) return flash("แนบสลิปโอนเงินก่อนยืนยันจ่าย", true);
    onConfirm({ accountId, payDate, slipUrl });
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="modal-head"><div className="modal-title">ทำจ่ายเงินเดือนทั้งรอบ · {fmtBaht(total)}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>{count} คน · รวมจ่ายสุทธิ {fmtBaht(total)}</div>
          <label className="fld"><span>จ่ายจากบัญชี</span>
            {accounts === null ? <div className="jo-dim">กำลังโหลดบัญชี…</div> :
              <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((x) => <option key={x.id} value={x.id}>{(x.kind === "cash" ? "💵 " : "🏦 ") + x.name} (คงเหลือ {fmtBaht(x.balance)})</option>)}
              </select>}
          </label>
          <label className="fld"><span>วันที่จ่าย</span><input type="date" className="inp" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
          <label className="fld"><span>สลิปโอนเงิน (จำเป็น — โอนรวมหรือภาพสรุปการโอน)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {slipUrl ? <img src={slipUrl} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 9, border: "1px solid var(--line)", cursor: "zoom-in" }} onClick={() => window.open(slipUrl, "_blank")} /> : null}
              <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
                📎 {uploading ? "กำลังอัปโหลด…" : slipUrl ? "เปลี่ยนสลิป" : "แนบสลิป/ถ่ายรูป"}
                <input type="file" accept="image/*" onChange={onSlip} style={{ display: "none" }} disabled={uploading} />
              </label>
              {slipUrl && <button type="button" className="btn-ghost sm danger" onClick={() => setSlipUrl("")}>ลบ</button>}
            </div>
          </label>
          <div className="jo-dim">ระบบจะบันทึกสลิปทุกคนเป็น "จ่ายแล้ว" · หักเบิกล่วงหน้าที่ค้าง · ลง<b>เดินบัญชี</b>เป็นเงินออกก้อนเดียว · เข้า<b>กระแสเงินสด</b> — แล้วส่งสลิปรายคนได้จากปุ่ม 📲 ในตาราง</div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={uploading || accounts === null} onClick={confirmPay}>ยืนยันจ่ายทั้งรอบ</button></div>
      </div>
    </div>
  );
}

function PayRow({ p, onSave }) {
  const [payType, setPayType] = React.useState(p.pay_type || "monthly");
  const [basePay, setBasePay] = React.useState(p.base_pay ?? 0);
  const [otRate, setOtRate] = React.useState(p.ot_rate ?? 0);
  const [sso, setSso] = React.useState(!!p.sso);
  const [cid, setCid] = React.useState(p.citizen_id || "");
  const [taxWht, setTaxWht] = React.useState(p.tax_wht ?? 0);   // ภาษีหัก ณ ที่จ่ายต่อเดือน (ภ.ง.ด.1) ที่บัญชีเคาะ
  React.useEffect(() => { setPayType(p.pay_type || "monthly"); setBasePay(p.base_pay ?? 0); setOtRate(p.ot_rate ?? 0); setSso(!!p.sso); setCid(p.citizen_id || ""); setTaxWht(p.tax_wht ?? 0); }, [p.pay_type, p.base_pay, p.ot_rate, p.sso, p.citizen_id, p.tax_wht]);
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
      <input className="inp" style={{ width: 150 }} placeholder="เลขบัตร ปชช." title="ใช้ออกไฟล์ประกันสังคม (สปส.1-10) และสรุปยื่น ภงด.1 (ต้องรัน migration 130)" value={cid}
        onChange={(e) => setCid(e.target.value)} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (p.citizen_id || "")) onSave({ citizen_id: v || null }); }} />
      {/* ยอดภาษีที่บัญชีเคาะต่อเดือน — ระบบหักให้ในสลิปและเติมลงไฟล์ ภ.ง.ด.1 เอง (mig 161) */}
      <span className="inp inp-unit" style={{ width: 140 }} title="ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.1) ต่อเดือน ที่บัญชีเคาะ — 0 = ไม่ถึงเกณฑ์เสียภาษี"><span className="unit-pre">ภาษี ฿</span>
        <input type="number" min="0" value={taxWht} onChange={(e) => setTaxWht(e.target.value)}
          onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== (Number(p.tax_wht) || 0)) onSave({ tax_wht: v }); }} /><span className="unit-suf">/ด.</span></span>
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
        <label className="hr-sso" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={!!s.otNeedsApproval} onChange={(e) => setS({ ...s, otNeedsApproval: e.target.checked })} />
          <span><b>OT ต้องรับรองก่อนคิดเงิน</b> — เปิดแล้ว OT จะเข้าเงินเดือน/รายงานเฉพาะวันที่ HR กด “รับรอง OT” ในแท็บวันนี้ (กัน OT อัตโนมัติจากการเช็คเอาท์ช้า · ต้องรัน migration 144)</span>
        </label>
        <div className="fld-row" style={{ marginTop: 10 }}>
          <label className="fld"><span>พิกัดร้าน (lat, lng) — เตือนเช็คอินไกลร้าน</span>
            <input className="inp" placeholder="เช่น 13.7563, 100.5018 (เว้นว่าง = ไม่เตือน)" value={s.geo || ""} onChange={(e) => setS({ ...s, geo: e.target.value })} /></label>
          <label className="fld"><span>รัศมีเตือน (กม.)</span>
            <input className="inp" type="number" min="0" step="0.1" value={s.geoKm ?? 1} onChange={(e) => setS({ ...s, geoKm: Number(e.target.value) || 0 })} /></label>
        </div>
        <p className="page-sub" style={{ marginTop: 4 }}>ใส่พิกัดแล้ว แท็บวันนี้จะขึ้นป้ายส้มบอกระยะ เมื่อเช็คอิน/เอาท์อยู่ไกลจากร้านเกินรัศมี (ก็อปพิกัดจาก Google Maps: คลิกขวาที่ร้าน → ตัวเลขบรรทัดแรก) — งานหน้าไซต์ลูกค้าเป็นเรื่องปกติ ป้ายนี้ไว้ประกอบการดู ไม่ได้บล็อกการเช็คอิน</p>
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
      const u = {}; lv.forEach((l) => { const dY = leaveDaysInYear(l, year); if (dY > 0) (u[l.user_id] = u[l.user_id] || {})[l.type] = (u[l.user_id]?.[l.type] || 0) + dY; });
      setUsed(u);
    } catch (e) { flash("โหลดโควต้าไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  const qOf = (id) => ({ vacation: over[id]?.vacation ?? def.vacation, personal: over[id]?.personal ?? def.personal, sick: over[id]?.sick ?? def.sick });
  // พิมพ์ = อัปเดตหน้าจออย่างเดียว · บันทึกจริงตอนออกจากช่อง (onBlur) — เดิมยิง API ทุกตัวอักษร
  function setLocal(id, type, val) {
    const next = { ...qOf(id), [type]: Math.max(0, Number(val) || 0) };
    setOver((o) => ({ ...o, [id]: { ...(o[id] || {}), ...next } }));
  }
  async function persist(id) {
    try { await saveLeaveQuota(id, year, qOf(id)); } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
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
                      <td><input className="inp hr-q-inp" type="number" min="0" value={q[k]} onChange={(e) => setLocal(p.id, k, e.target.value)} onBlur={() => persist(p.id)} /></td>
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
