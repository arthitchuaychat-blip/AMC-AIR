import React from "react";
import { listAttendance, listLeaves, decideLeave, listHrStaff, updateHrProfile, getHrSettings, saveHrSettings, listHolidays, saveHoliday, deleteHoliday, getLeaveQuotas, saveLeaveQuota, listPayslips, savePayslip, setPayslipPaid } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { DEFAULT_HR_SETTINGS, dayStat, fmtMin, fmtTime, isWorkday, WORK_PATTERNS, patternLabel, leaveLabel, LEAVE_TYPES, hrYmd, hrParseYmd, todayYmd } from "../lib/hr";
import { payPeriod, periodStats, computePayslip } from "../lib/payroll";
import { fmtBaht } from "../lib/format";
import { UIcon } from "../icons";

const TABS = [["today", "วันนี้"], ["leaves", "อนุมัติลา"], ["report", "รายงาน/สถิติ"], ["payroll", "เงินเดือน"], ["staff", "กะ & ตั้งค่า"]];
const thDate = (s) => hrParseYmd(s).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });
const monthRange = (ym) => { const [y, m] = ym.split("-").map(Number); const last = new Date(y, m, 0).getDate(); const p = (n) => String(n).padStart(2, "0"); return [`${ym}-01`, `${ym}-${p(last)}`, last]; };

export default function HR({ role }) {
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

      {tab === "today" && <TodayTab staff={staff} settings={settings} holSet={holSet} flash={flash} />}
      {tab === "leaves" && <LeavesTab flash={flash} />}
      {tab === "report" && <ReportTab staff={staff} settings={settings} holSet={holSet} flash={flash} />}
      {tab === "payroll" && <PayrollTab staff={staff} settings={settings} holSet={holSet} flash={flash} />}
      {tab === "staff" && <StaffTab staff={staff} settings={settings} holidays={holidays} onReload={loadBase} flash={flash} />}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// ---------- TODAY ----------
function TodayTab({ staff, settings, holSet, flash }) {
  const [att, setAtt] = React.useState([]);
  const [onLeave, setOnLeave] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const day = todayYmd();
  React.useEffect(() => { (async () => {
    try {
      const [a, lv] = await Promise.all([listAttendance(day, day), listLeaves("approved")]);
      setAtt(a);
      const m = {}; lv.forEach((l) => { if (l.start_date <= day && l.end_date >= day) m[l.user_id] = l.type; }); setOnLeave(m);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  })(); }, []);
  const attBy = Object.fromEntries(att.map((a) => [a.user_id, a]));
  const rows = staff.map((p) => {
    const a = attBy[p.id], s = a ? dayStat(a, settings) : null;
    const work = isWorkday(day, p.work_pattern || "mon_sat", p.sat_group, holSet);
    let status = "off";
    if (onLeave[p.id]) status = "leave";
    else if (a?.check_in_at) status = s.isLate ? "late" : "in";
    else if (work) status = "absent";
    return { p, a, s, status };
  });
  const order = { in: 0, late: 1, absent: 2, leave: 3, off: 4 };
  rows.sort((x, y) => order[x.status] - order[y.status] || (x.p.name || "").localeCompare(y.p.name || "", "th"));
  const ST = { in: { t: "เข้างานแล้ว", c: "b-green" }, late: { t: "มาสาย", c: "b-amber" }, absent: { t: "ยังไม่เข้า/ขาด", c: "b-red" }, leave: { t: "ลา", c: "b-blue" }, off: { t: "วันหยุด", c: "b-grey" } };
  if (loading) return <div className="empty">กำลังโหลด…</div>;
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">{thDate(day)}</div>
        <div className="sec-sub">เข้าแล้ว {rows.filter((r) => r.status === "in" || r.status === "late").length} · ยังไม่เข้า {rows.filter((r) => r.status === "absent").length} · ลา {rows.filter((r) => r.status === "leave").length}</div></div></div>
      <div className="set-list">
        {rows.map(({ p, a, s, status }) => { const b = ST[status]; return (
          <div className="hr-today-row" key={p.id}>
            <div className="hr-name"><b>{p.name || p.email}</b><span className="jo-dim">{p.department || "-"}</span></div>
            <div className="hr-times">
              <span>เข้า <b>{fmtTime(a?.check_in_at)}</b>{s?.isLate && <span className="att-tag late sm">+{fmtMin(s.lateMin)}</span>}</span>
              <span>ออก <b>{fmtTime(a?.check_out_at)}</b>{s?.otMin > 0 && <span className="att-tag ot sm">OT {fmtMin(s.otMin)}</span>}</span>
            </div>
            <span className={"job-badge " + b.c}>{status === "leave" ? leaveLabel(onLeave[p.id]) : b.t}</span>
          </div>
        ); })}
      </div>
    </div>
  );
}

// ---------- LEAVES ----------
function LeavesTab({ flash }) {
  const [list, setList] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  async function load() { try { setList(await listLeaves()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); } setLoading(false); }
  React.useEffect(() => { load(); }, []);
  async function decide(l, status) {
    if (!await confirmDialog(`${status === "approved" ? "อนุมัติ" : "ไม่อนุมัติ"}ใบลาของ ${l.name}?`)) return;
    try { await decideLeave(l.id, status); flash(status === "approved" ? "อนุมัติแล้ว" : "ไม่อนุมัติแล้ว"); load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
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
              {l.status === "pending" && <>
                <button className="btn-primary sm ok" onClick={() => decide(l, "approved")}>อนุมัติ</button>
                <button className="btn-ghost sm" onClick={() => decide(l, "rejected")}>ไม่อนุมัติ</button>
              </>}
            </div>
          </div>
        ); })}
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
        let present = 0, lateCnt = 0, lateMin = 0, otMin = 0, absent = 0, workdays = 0, leaveCnt = 0;
        for (let d = hrParseYmd(from); d <= hrParseYmd(calcTo); d.setDate(d.getDate() + 1)) {
          const k = hrYmd(d);
          const onLeave = leaveDaySet[p.id]?.[k];
          if (onLeave) { leaveCnt++; continue; }
          if (!isWorkday(k, p.work_pattern || "mon_sat", p.sat_group, holSet)) continue;
          workdays++;
          const a = attByUserDay[p.id]?.[k];
          if (a?.check_in_at) { present++; const s = dayStat(a, settings); if (s.isLate) { lateCnt++; lateMin += s.lateMin; } otMin += s.otMin; }
          else absent++;
        }
        return { p, present, lateCnt, lateMin, otMin, absent, workdays, leaveCnt };
      });
      result.sort((a, b) => b.absent - a.absent || b.lateCnt - a.lateCnt); // worst first (for review)
      setRows(result); setRaw({ attByUserDay, leaveDaySet, from, calcTo });
    } catch (e) { flash("คำนวณไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { run(); }, [ym]);

  function exportCsv() {
    if (!rows) return;
    const head = ["ชื่อ", "แผนก", "วันทำงาน", "มา", "ขาด", "ลา", "สาย(ครั้ง)", "สายรวม(นาที)", "OT(นาที)"];
    const lines = rows.map((r) => [r.p.name, r.p.department || "", r.workdays, r.present, r.absent, r.leaveCnt, r.lateCnt, Math.round(r.lateMin), Math.round(r.otMin)]);
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
                  <td>{fmtMin(r.otMin)}</td>
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
            <span>OT {fmtMin(row.otMin)}</span>
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
                      {d.s?.otMin > 0 && <span className="att-tag ot sm">OT {fmtMin(d.s.otMin)}</span>}</>
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
// ---------- PAYROLL (เงินเดือน) ----------
function PayrollTab({ staff, settings, holSet, flash }) {
  const pad = (n) => String(n).padStart(2, "0");
  const [ym, setYm] = React.useState(() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; });
  const { from, to } = payPeriod(ym);
  const [rows, setRows] = React.useState(null);
  const [paidStatus, setPaidStatus] = React.useState("draft");
  const [adj, setAdj] = React.useState({});     // user_id → { bonus, other_deduct }
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const lastDay = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();

  async function load() {
    setLoading(true);
    try {
      const [att, leaves, slips] = await Promise.all([listAttendance(from, to), listLeaves("approved"), listPayslips(ym)]);
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

  const calcOf = (r) => computePayslip({ ...r.p, bonus: adj[r.p.id]?.bonus || 0, other_deduct: adj[r.p.id]?.other_deduct || 0 }, r.st, {});
  const setA = (id, k, v) => setAdj((s) => ({ ...s, [id]: { ...s[id], [k]: Number(v) || 0 } }));
  const payable = (rows || []).filter((r) => (Number(r.p.base_pay) || 0) > 0 || r.st.present > 0);
  const totalNet = payable.reduce((a, r) => a + calcOf(r).net, 0);

  async function saveRun(markPaid) {
    setBusy(true);
    try {
      for (const r of payable) {
        const c = calcOf(r);
        await savePayslip({ period: ym, user_id: r.p.id, pay_type: r.p.pay_type || "monthly",
          base: c.base, ot_pay: c.otPay, present_days: r.st.present, absent_days: r.st.absent, leave_days: r.st.leaveDays, over_leave_days: r.st.overLeave,
          late_min: r.st.lateMin, ot_min: r.st.otMin, d_late: c.dLate, d_absent: c.dAbsent, d_leave: c.dLeave, d_sso: c.dSso,
          bonus: c.bonus, other_deduct: c.otherDeduct, net: c.net, status: markPaid ? "paid" : "draft" });
      }
      if (markPaid) await setPayslipPaid(ym, true);
      flash(markPaid ? "บันทึก + ทำจ่ายเงินเดือนแล้ว ✓" : "บันทึกรอบเงินเดือนแล้ว ✓"); await load();
    } catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div className="card">
      <div className="sec-head">
        <div><div className="sec-title">เงินเดือน · รอบ {ym}</div>
          <div className="sec-sub">รอบตัดวันที่ 25 — {from} ถึง {to} · จ่ายวันสิ้นเดือน (วันที่ {lastDay}) {paidStatus === "paid" ? "· ✅ จ่ายแล้ว" : ""}</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input className="inp" type="month" value={ym} onChange={(e) => setYm(e.target.value)} style={{ width: 160 }} />
          <button className="btn-ghost sm" disabled={busy || !payable.length} onClick={() => saveRun(false)}>บันทึกรอบ</button>
          <button className="btn-primary sm ok" disabled={busy || !payable.length} onClick={() => saveRun(true)}>ทำจ่ายทั้งรอบ</button>
        </div>
      </div>
      {loading ? <div className="empty">กำลังคำนวณ…</div> : payable.length === 0 ? <div className="empty">ยังไม่มีพนักงานที่ตั้งฐานเงินเดือน — ไปตั้งที่แท็บ “กะ & ตั้งค่า”</div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="hr-table pay-table">
            <thead><tr><th style={{ textAlign: "left" }}>พนักงาน</th><th>ฐาน</th><th>OT (ชม.)</th><th>หักสาย</th><th>หักขาด</th><th>หักลาเกิน</th><th>ปกส.</th><th>โบนัส</th><th>หักอื่นๆ</th><th>สุทธิ</th></tr></thead>
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
                  <td><span className="inp inp-unit pay-adj"><span className="unit-pre">฿</span><input type="number" value={adj[r.p.id]?.bonus || 0} onChange={(e) => setA(r.p.id, "bonus", e.target.value)} /></span></td>
                  <td><span className="inp inp-unit pay-adj"><span className="unit-pre">฿</span><input type="number" value={adj[r.p.id]?.other_deduct || 0} onChange={(e) => setA(r.p.id, "other_deduct", e.target.value)} /></span></td>
                  <td style={{ fontWeight: 800, color: "var(--up)" }}>{fmtBaht(c.net)}</td>
                </tr>
              ); })}
            </tbody>
            <tfoot><tr><td style={{ textAlign: "left" }}>รวมจ่ายสุทธิ ({payable.length} คน)</td><td colSpan={8} /><td style={{ fontWeight: 800 }}>{fmtBaht(totalNet)}</td></tr></tfoot>
          </table>
        </div>
      )}
      <p className="page-sub" style={{ marginTop: 10 }}>* ฐานรายเดือน = เงินเดือนเต็ม · ฐานรายวัน = วันที่มา × ค่าแรง/วัน · OT = ชม.OT × เรตที่ตั้ง · หักสาย/ขาด คิดจากเรตรายชั่วโมง/วัน · ปกส. 5% (สูงสุด 750) · แก้โบนัส/หักอื่นๆ ได้ในตาราง แล้วกด “บันทึกรอบ”</p>
    </div>
  );
}

function StaffTab({ staff, settings, holidays, onReload, flash }) {
  const [s, setS] = React.useState(settings);
  const [nh, setNh] = React.useState({ day: "", name: "" });
  React.useEffect(() => { setS(settings); }, [settings]);

  async function saveSettings() {
    try { await saveHrSettings(s); flash("บันทึกเวลาทำงานแล้ว ✓"); onReload(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e) + " (รัน 041_hr.sql + 039 แล้วหรือยัง?)", true); }
  }
  async function setPattern(p, field, val) {
    try { await updateHrProfile(p.id, { [field]: val }); onReload(); }
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
        <div className="sec-head"><div><div className="sec-title">ค่าจ้าง / เงินเดือน (ต่อคน)</div><div className="sec-sub">ตั้งฐานเงินเดือน (รายเดือน/รายวัน) · เรต OT ต่อชั่วโมง · ประกันสังคม 5%</div></div></div>
        <div className="set-list">
          {staff.map((p) => (
            <div className="hr-pay-row" key={p.id}>
              <div className="hr-name"><b>{p.name || p.email}</b></div>
              <select className="inp" style={{ width: 110 }} value={p.pay_type || "monthly"} onChange={(e) => setPattern(p, "pay_type", e.target.value)}>
                <option value="monthly">รายเดือน</option><option value="daily">รายวัน</option>
              </select>
              <span className="inp inp-unit" style={{ width: 130 }} title={p.pay_type === "daily" ? "ค่าแรงต่อวัน" : "เงินเดือนต่อเดือน"}><span className="unit-pre">฿</span>
                <input type="number" min="0" defaultValue={p.base_pay || 0} onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== (Number(p.base_pay) || 0)) setPattern(p, "base_pay", v); }} /></span>
              <span className="inp inp-unit" style={{ width: 130 }} title="เรต OT ต่อชั่วโมง"><span className="unit-pre">OT ฿</span>
                <input type="number" min="0" defaultValue={p.ot_rate || 0} onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== (Number(p.ot_rate) || 0)) setPattern(p, "ot_rate", v); }} /><span className="unit-suf">/ชม.</span></span>
              <label className="hr-sso"><input type="checkbox" checked={!!p.sso} onChange={(e) => setPattern(p, "sso", e.target.checked)} /> ประกันสังคม</label>
            </div>
          ))}
        </div>
      </div>

      <div className="damage-layout">
        <div className="card">
          <div className="sec-head"><div><div className="sec-title">กะงานพนักงาน</div><div className="sec-sub">กำหนดวันทำงานแต่ละคน</div></div></div>
          <div className="set-list">
            {staff.map((p) => (
              <div className="hr-staff-row" key={p.id}>
                <div className="hr-name"><b>{p.name || p.email}</b></div>
                <input className="inp" style={{ width: 110 }} placeholder="แผนก" defaultValue={p.department || ""} onBlur={(e) => e.target.value !== (p.department || "") && setPattern(p, "department", e.target.value)} />
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
