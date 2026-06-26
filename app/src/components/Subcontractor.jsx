import React from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { listJobOrders, listTeams, listQuotations, listSubPayouts, jobMaterialCost, saveJobLabor, saveJobReview, confirmJobLabor, createSubPayout, paySubPayout, cancelSubPayout, updateSubPayout, deleteSubPayout, listChatRooms, uploadChatImage, sendChatImage, sendChatMessage } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht, round2 } from "../lib/format";
import { UIcon } from "../icons";

const TABS = [["labor", "ค่าแรง/งาน"], ["pay", "ค่าแรงรอจ่าย"], ["score", "สกอร์การ์ดทีม"]];
const WHT_RATE = 3;
const PAY_ROLES = ["admin", "exec", "finance"];        // who can create/confirm payments (money out)
const LABOR_ROLES = ["admin", "exec", "finance", "sales"]; // who can fill + confirm labor
const EDIT_PAYOUT_ROLES = ["admin", "finance"];        // ธุรการ + บัญชี: แก้ไขใบจ่าย (รวมที่จ่ายแล้ว)

// labor lines default to rate% of each line's sale amount (accounting can edit)
function buildLines(items, rate) {
  return (items || []).map((it) => {
    const qty = Number(it.qty) || 0, price = Number(it.unit_price) || 0;
    const sale = round2(qty * price);
    return { code: it.item_code || null, name: it.name, qty, unit: it.unit || "", price, sale, labor: round2(sale * (Number(rate) || 0) / 100) };
  });
}
const sumLabor = (lines) => round2((lines || []).reduce((a, l) => a + (Number(l.labor) || 0), 0));
const remaining = (j) => round2((Number(j.labor_total) || 0) - (Number(j.labor_paid_amt) || 0));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";

export default function Subcontractor({ role, onOpenDoc }) {
  const canPay = PAY_ROLES.includes(role);
  const canLabor = LABOR_ROLES.includes(role);
  const tabs = TABS.filter(([v]) => v !== "pay" || canPay);
  const [tab, setTab] = React.useState("labor");
  const [jobs, setJobs] = React.useState([]);
  const [teams, setTeams] = React.useState([]);
  const [quoteBy, setQuoteBy] = React.useState({});
  const [payouts, setPayouts] = React.useState([]);
  const [matCost, setMatCost] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  function flash(m, bad) { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); }

  async function load() {
    setLoading(true);
    try {
      const [jo, tm, qs, po, mc] = await Promise.all([listJobOrders(), listTeams(), listQuotations(), listSubPayouts(), jobMaterialCost()]);
      setJobs(jo); setTeams(tm); setQuoteBy(Object.fromEntries(qs.map((q) => [q.quote_no, q]))); setPayouts(po); setMatCost(mc);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  const subTeams = teams.filter((t) => t.type === "sub");
  const subTeamIds = new Set(subTeams.map((t) => t.id));
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]));
  const subJobs = jobs.filter((j) => subTeamIds.has(j.assigned_team) && j.status !== "cancelled");

  if (loading) return <div className="adm"><div className="empty">กำลังโหลด…</div></div>;

  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">ช่างซัพ <span className="page-title-en">Subcontractors</span></h1>
        <p className="page-sub">ค่าแรงเหมาต่องาน → ยืนยันค่าแรง → ค่าแรงรอจ่าย (แบ่งจ่ายได้ · หัก ณ ที่จ่าย 3% เฉพาะงาน VAT) → ส่งสลิปให้ทีม</p></div></div>

      {subTeams.length === 0 && <div className="card"><div className="empty">ยังไม่มีทีมช่างซัพ — ไปตั้งค่าได้ที่ ตั้งค่า → ทีมช่าง แล้วเลือกประเภท "ช่างซัพ"</div></div>}

      {subTeams.length > 0 && <>
        <div className="cat-filter">
          {tabs.map(([v, l]) => <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
            style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>)}
        </div>

        {tab === "labor" && <LaborTab jobs={subJobs} quoteBy={quoteBy} teamById={teamById} subTeams={subTeams} canLabor={canLabor} onReload={load} flash={flash} onOpenDoc={onOpenDoc} />}
        {tab === "pay" && canPay && <PayTab role={role} jobs={subJobs} quoteBy={quoteBy} subTeams={subTeams} teamById={teamById} payouts={payouts} onReload={load} flash={flash} />}
        {tab === "score" && <ScoreTab jobs={subJobs} quoteBy={quoteBy} subTeams={subTeams} matCost={matCost} payouts={payouts} />}
      </>}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// ---------- LABOR per job (fill → confirm) ----------
function LaborTab({ jobs, quoteBy, teamById, subTeams, canLabor, onReload, flash, onOpenDoc }) {
  const [edit, setEdit] = React.useState(null);
  const [busy, setBusy] = React.useState(null);
  const [teamF, setTeamF] = React.useState("all");
  const [statusF, setStatusF] = React.useState("all");
  const [jobPreview, setJobPreview] = React.useState(null);
  const STATUS = { done: { t: "เสร็จ", c: "b-green" }, in_progress: { t: "กำลังทำ", c: "b-amber" }, scheduled: { t: "นัดแล้ว", c: "b-blue" }, pending: { t: "รอจ่ายงาน", c: "b-grey" }, awaiting_approval: { t: "รออนุมัติ", c: "b-purple" }, reschedule: { t: "นัดเพิ่ม", c: "b-orange" } };
  // only show team / status options that actually appear in the current job list
  const teamOpts = (subTeams || []).filter((t) => jobs.some((j) => j.assigned_team === t.id));
  const statusOpts = [["all", "ทุกสถานะ"], ...Object.entries(STATUS).filter(([k]) => jobs.some((j) => j.status === k)).map(([k, v]) => [k, v.t])];
  const shown = jobs.filter((j) => (teamF === "all" || j.assigned_team === teamF) && (statusF === "all" || j.status === statusF));

  async function confirm(j, val) {
    setBusy(j.job_no);
    try { await confirmJobLabor(j.job_no, val); flash(val ? "ยืนยันค่าแรงแล้ว ✓ (ไปต่อที่แท็บค่าแรงรอจ่าย)" : "ยกเลิกยืนยันแล้ว"); onReload(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(null);
  }

  // labor state for the row badge
  function state(j) {
    if (!(j.labor_total > 0)) return { t: "ยังไม่กรอกค่าแรง", c: "b-grey" };
    if (j.labor_paid) return { t: "จ่ายครบแล้ว", c: "b-green" };
    if ((Number(j.labor_paid_amt) || 0) > 0) return { t: "จ่ายบางส่วน", c: "b-amber" };
    if (j.labor_confirmed) return { t: "ยืนยันแล้ว · รอจ่าย", c: "b-blue" };
    return { t: "กรอกแล้ว · รอยืนยัน", c: "b-orange" };
  }

  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">ค่าแรงเหมาต่องาน</div><div className="sec-sub">กรอกค่าแรงรายบรรทัด (ดีฟอลต์ = % ของราคาขาย) → เมื่องาน “เสร็จ” กด “ยืนยันค่าแรง” เพื่อส่งไปหน้ารอจ่าย</div></div></div>
      <div className="cat-filter" style={{ marginBottom: 10, alignItems: "center" }}>
        <select className="inp" style={{ width: "auto", flex: "none" }} value={teamF} onChange={(e) => setTeamF(e.target.value)}>
          <option value="all">ทุกทีมช่างซัพ</option>
          {teamOpts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {statusOpts.map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)}
            style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>
      <div className="set-list">
        {jobs.length === 0 && <div className="empty sm">ยังไม่มีงานของทีมช่างซัพ</div>}
        {jobs.length > 0 && shown.length === 0 && <div className="empty sm">ไม่พบงานตามตัวกรอง</div>}
        {shown.map((j) => {
          const q = quoteBy[j.quote_no]; const st = STATUS[j.status] || STATUS.pending; const ls = state(j);
          const locked = (Number(j.labor_paid_amt) || 0) > 0;        // already in a payout → can't edit/unconfirm
          const canConfirm = canLabor && j.status === "done" && j.labor_total > 0 && !j.labor_confirmed;
          return (
            <div className="sub-job-row" key={j.job_no}>
              <div className="sub-job-main">
                <div>{j.scheduled_at && <span className="jo-dim" style={{ fontSize: 11, marginRight: 5 }}>{fmtDate(j.scheduled_at)}</span>}<button type="button" className="sub-job-link" onClick={() => setJobPreview(j)} title="ดูรายละเอียดงาน">{j.job_no}</button> <span className={"job-badge " + st.c}>{st.t}</span>
                  {q?.vat ? <span className="vat-badge vat-on">VAT</span> : <span className="vat-badge vat-off">NO VAT</span>}
                  {j.is_claim && <span className="vat-badge vat-off">เคลม</span>}</div>
                <div className="jo-dim">{j.customerName || "-"} · ทีม {teamById[j.assigned_team]?.name || j.assigned_team} · {j.title || "งาน"}</div>
              </div>
              <div className="sub-job-state"><span className={"job-badge " + ls.c}>{ls.t}</span></div>
              <div className="sub-job-amt">
                <span>มูลค่างาน <b>{fmtBaht(q?.afterDisc || 0)}</b></span>
                <span>ค่าแรง <b className={j.labor_total > 0 ? "" : "hr-warn"}>{j.labor_total > 0 ? fmtBaht(j.labor_total) : "ยังไม่กรอก"}</b></span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {canLabor && !j.labor_confirmed && <button className="btn-ghost sm" onClick={() => setEdit(j)}>กรอกค่าแรง</button>}
                {canConfirm && <button className="btn-primary sm ok" disabled={busy === j.job_no} onClick={() => confirm(j, true)}>✓ ยืนยันค่าแรง</button>}
                {canLabor && j.labor_confirmed && !locked && <button className="btn-ghost sm" disabled={busy === j.job_no} onClick={() => confirm(j, false)}>ยกเลิกยืนยัน</button>}
              </div>
            </div>
          );
        })}
      </div>
      {edit && <LaborEditor job={edit} quote={quoteBy[edit.quote_no]} rate={teamById[edit.assigned_team]?.payout_rate ?? 80} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onReload(); }} flash={flash} />}
      {jobPreview && (() => {
        const jp = jobPreview; const st2 = { done: { t: "เสร็จ", c: "b-green" }, in_progress: { t: "กำลังทำ", c: "b-amber" }, scheduled: { t: "นัดแล้ว", c: "b-blue" }, pending: { t: "รอจ่ายงาน", c: "b-grey" }, awaiting_approval: { t: "รออนุมัติ", c: "b-purple" }, reschedule: { t: "นัดเพิ่ม", c: "b-orange" }, cancelled: { t: "ยกเลิก", c: "b-red" } };
        const jst = st2[jp.status] || { t: jp.status, c: "b-grey" }; const team = teamById[jp.assigned_team];
        return (
          <div className="confirm-overlay" onMouseDown={() => setJobPreview(null)}>
            <div className="confirm-box" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 480, textAlign: "left", padding: "20px 22px", gap: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{jp.job_no}</span>
                  <span className={"job-badge " + jst.c}>{jst.t}</span>
                </div>
                <button className="btn-ghost sm" onClick={() => setJobPreview(null)} style={{ padding: "2px 10px" }}>✕</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 13.5 }}>
                {jp.title && <div><b>{jp.title}</b></div>}
                <div>🏢 <b>{jp.customerName || "-"}</b>{jp.customerAddr ? <span className="jo-dim"> · {jp.customerAddr}</span> : null}</div>
                {(jp.contact_name || jp.contact_phone) && <div>👤 {jp.contact_name || ""}{jp.contact_phone && <> · <a href={`tel:${jp.contact_phone}`} style={{ color: "var(--blue)" }}>📞 {jp.contact_phone}</a></>}</div>}
                {jp.address && <div>📍 {jp.address}{jp.map_url && <> · <a href={jp.map_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>แผนที่</a></>}</div>}
                <div>🗓 {jp.scheduled_at ? fmtDate(jp.scheduled_at) : "ยังไม่กำหนดวัน"}{jp.end_date && jp.end_date !== jp.scheduled_at ? ` – ${fmtDate(jp.end_date)}` : ""}</div>
                <div>👷 ทีม {team?.name || jp.assigned_team || "-"}</div>
                {jp.details && <div style={{ background: "var(--surface-2)", borderRadius: 8, padding: "8px 10px", whiteSpace: "pre-wrap" }}>{jp.details}</div>}
                {jp.sales_note && <div className="jo-dim" style={{ whiteSpace: "pre-wrap" }}>📌 บรีฟ: {jp.sales_note}</div>}
                {(() => { const items = quoteBy[jp.quote_no]?.items; if (!items?.length) return null; return (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: "var(--ink-2)", marginBottom: 4 }}>รายการสินค้า</div>
                    <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
                      <thead><tr style={{ borderBottom: "1px solid var(--line)", color: "var(--ink-2)" }}>
                        <th style={{ textAlign: "left", padding: "3px 4px", fontWeight: 500 }}>รายการ</th>
                        <th style={{ textAlign: "right", padding: "3px 4px", fontWeight: 500 }}>จำนวน</th>
                        <th style={{ textAlign: "right", padding: "3px 4px", fontWeight: 500 }}>ราคา/หน่วย</th>
                        <th style={{ textAlign: "right", padding: "3px 4px", fontWeight: 500 }}>รวม</th>
                      </tr></thead>
                      <tbody>{items.map((it, i) => { const qty = Number(it.qty) || 0; const price = Number(it.unit_price) || 0; return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                          <td style={{ padding: "4px 4px" }}>{it.name}{it.description ? <div className="jo-dim" style={{ fontSize: 11 }}>{it.description}</div> : null}</td>
                          <td style={{ textAlign: "right", padding: "4px 4px", whiteSpace: "nowrap" }}>{qty} {it.unit || ""}</td>
                          <td style={{ textAlign: "right", padding: "4px 4px", whiteSpace: "nowrap" }}>{fmtBaht(price)}</td>
                          <td style={{ textAlign: "right", padding: "4px 4px", whiteSpace: "nowrap", fontWeight: 600 }}>{fmtBaht(qty * price)}</td>
                        </tr>); })}
                      </tbody>
                    </table>
                  </div>
                ); })()}
              </div>
              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn-ghost sm" onClick={() => { setJobPreview(null); onOpenDoc && onOpenDoc("job", jp.job_no); }}>เปิดหน้าใบงาน →</button>
                <button className="btn-ghost sm" onClick={() => setJobPreview(null)}>ปิด</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function LaborEditor({ job, quote, rate, onClose, onSaved, flash }) {
  const fresh = buildLines(quote?.items, rate);
  const saved = job.labor_lines || [];
  const init = fresh.map((l, i) => (saved[i] && saved[i].labor != null ? { ...l, labor: Number(saved[i].labor) || 0 } : l));
  const [lines, setLines] = React.useState(init);
  const [rating, setRating] = React.useState(job.rating || 0);
  const [claim, setClaim] = React.useState(!!job.is_claim);
  const [busy, setBusy] = React.useState(false);
  const total = sumLabor(lines);
  const setLabor = (i, v) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, labor: Number(v) || 0 } : l));
  const resetDefault = () => setLines(buildLines(quote?.items, rate));
  async function save(confirmAfter) {
    setBusy(true);
    try {
      await saveJobLabor(job.job_no, lines, total); await saveJobReview(job.job_no, rating || null, claim);
      if (confirmAfter) { await confirmJobLabor(job.job_no, true); flash("บันทึก + ยืนยันค่าแรงแล้ว ✓"); }
      else flash("บันทึกค่าแรงแล้ว ✓");
      onSaved();
    }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  const canConfirmNow = job.status === "done" && total > 0;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620 }}>
        <div className="modal-head"><div className="modal-title">ค่าแรงเหมา · {job.job_no}<span>{job.customerName || ""}</span></div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="sub-lab-head"><span>รายการ</span><span>จำนวน</span><span>ราคา/หน่วย</span><span>ราคาขาย</span><span>ค่าแรง</span></div>
          {lines.map((l, i) => (
            <div className="sub-lab-row" key={i}>
              <span className="sub-lab-name">{l.name}</span>
              <span className="sub-lab-qty">{l.qty} {l.unit}</span>
              <span className="sub-lab-unit">{fmtBaht(l.price)}</span>
              <span className="sub-lab-sale">{fmtBaht(l.sale)}</span>
              <span className="inp inp-unit sub-lab-inp"><span className="unit-pre">฿</span><input type="number" min="0" value={l.labor} onChange={(e) => setLabor(i, e.target.value)} /></span>
            </div>
          ))}
          <div className="sub-lab-total"><span>รวมค่าแรงเหมา</span><b>{fmtBaht(total)}</b></div>
          <button className="btn-ghost sm" style={{ marginTop: 6 }} onClick={resetDefault}>รีเซ็ตเป็น {rate}% ของราคาขาย</button>
          <div className="sub-review">
            <div className="fld"><span>คะแนนงาน (1–5)</span>
              <div className="sub-stars">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" className={"sub-star" + (n <= rating ? " on" : "")} onClick={() => setRating(n === rating ? 0 : n)}>★</button>)}</div></div>
            <label className="sub-claim"><input type="checkbox" checked={claim} onChange={(e) => setClaim(e.target.checked)} /> งานนี้เป็นงานเคลม/แก้ซ้ำ</label>
          </div>
          {!canConfirmNow && <p className="page-sub" style={{ marginTop: 8 }}>* ยืนยันค่าแรงได้เมื่องานสถานะ “เสร็จ” แล้ว</p>}
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-ghost" disabled={busy} onClick={() => save(false)}>บันทึก (ยังไม่ยืนยัน)</button>
          <button className="btn-primary" disabled={busy || !canConfirmNow} onClick={() => save(true)}>บันทึก + ยืนยันค่าแรง</button></div>
      </div>
    </div>
  );
}

// ---------- ค่าแรงรอจ่าย (split payments) ----------
function PayTab({ role, jobs, quoteBy, subTeams, teamById, payouts, onReload, flash }) {
  const [slip, setSlip] = React.useState(null); // payout to show as a slip
  const [editPo, setEditPo] = React.useState(null); // payout being edited
  const [busy, setBusy] = React.useState(false);
  const canEditPayout = EDIT_PAYOUT_ROLES.includes(role);
  // confirmed + still owing
  const payable = jobs.filter((j) => j.labor_confirmed && remaining(j) > 0.01);
  const byTeam = {}; payable.forEach((j) => { (byTeam[j.assigned_team] = byTeam[j.assigned_team] || []).push(j); });
  const teamName = (id) => teamById[id]?.name || id;
  const jobByNo = React.useMemo(() => Object.fromEntries(jobs.map((j) => [j.job_no, j])), [jobs]);

  async function markPaid(p) {
    if (!await confirmDialog(`ยืนยันว่าจ่ายเงินแล้ว ${fmtBaht(p.net)} ?`)) return;
    setBusy(true);
    try { await paySubPayout(p.id, "โอนเงิน"); flash("บันทึกจ่ายแล้ว ✓"); onReload(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function cancel(p) {
    if (!await confirmDialog(`ยกเลิกใบรอจ่ายนี้? ยอดที่ตัดไว้จะคืนกลับเข้า “รอจ่าย”`)) return;
    setBusy(true);
    try { await cancelSubPayout(p.id); flash("ยกเลิกใบรอจ่ายแล้ว"); onReload(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function del(p) {
    if (!await confirmDialog(`ลบใบจ่ายนี้ถาวร? (กู้คืนไม่ได้)\nยอดค่าแรงที่ตัดไว้จะคืนกลับเข้า “รอจ่าย”`)) return;
    setBusy(true);
    try { await deleteSubPayout(p.id); flash("ลบใบจ่ายแล้ว"); onReload(); } catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">ค่าแรงรอจ่าย</div><div className="sec-sub">เฉพาะงานที่ยืนยันค่าแรงแล้ว · เลือกงาน → จ่ายเต็ม / ตาม % / ตามยอดเงิน</div></div></div>
        {Object.keys(byTeam).length === 0 && <div className="empty sm">ไม่มีค่าแรงค้างจ่าย (ต้องยืนยันค่าแรงในแท็บ “ค่าแรง/งาน” ก่อน)</div>}
        {Object.entries(byTeam).map(([teamId, list]) => (
          <PayTeam key={teamId} team={teamById[teamId] || { id: teamId, name: teamId }} list={list} quoteBy={quoteBy} flash={flash} onCreated={onReload} />
        ))}
      </div>

      <div className="card">
        <div className="sec-head"><div><div className="sec-title">ใบจ่ายช่างซัพ</div></div></div>
        <div className="set-list">
          {payouts.length === 0 && <div className="empty sm">ยังไม่มีใบจ่าย</div>}
          {payouts.map((p) => (
            <div className="sub-payout-row" key={p.id}>
              <div><b>ทีม {teamName(p.team)}</b> · {(p.lines || p.job_nos || []).length} งาน · {fmtDate(p.created_at)}
                <div className="jo-dim">รวม {fmtBaht(p.gross)} − หัก {fmtBaht(p.wht_amt)} = สุทธิ {fmtBaht(p.net)}{p.paid_at ? ` · จ่าย ${fmtDate(p.paid_at)}` : ""}</div></div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
                {p.status === "paid" ? <span className="job-badge b-green">จ่ายแล้ว</span> : <span className="job-badge b-orange">รอจ่าย</span>}
                <button className="btn-ghost sm" onClick={() => setSlip(p)}><UIcon name="catalog" size={14} /> สลิป/ส่ง</button>
                {canEditPayout && <button className="btn-ghost sm" disabled={busy} title="แก้ไขยอดค่าแรงจ่าย (ธุรการ/บัญชี)" onClick={() => setEditPo(p)}><UIcon name="edit" size={14} /> แก้ไข</button>}
                {p.status !== "paid" && <button className="btn-primary sm ok" disabled={busy} onClick={() => markPaid(p)}>บันทึกจ่ายเงิน</button>}
                {p.status !== "paid" && <button className="btn-ghost sm danger" disabled={busy} onClick={() => cancel(p)}>ยกเลิก</button>}
                {canEditPayout && <button className="btn-ghost sm danger" disabled={busy} title="ลบใบจ่ายถาวร (ธุรการ/บัญชี)" onClick={() => del(p)}><UIcon name="trash" size={14} /> ลบ</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {slip && <PayoutSlip payout={slip} team={teamById[slip.team] || { id: slip.team, name: slip.team }} jobByNo={jobByNo} onClose={() => setSlip(null)} flash={flash} />}
      {editPo && <EditPayout payout={editPo} team={teamById[editPo.team] || { id: editPo.team, name: editPo.team }} jobByNo={jobByNo} onClose={() => setEditPo(null)} onSaved={() => { setEditPo(null); onReload(); }} flash={flash} />}
    </>
  );
}

// แก้ไขยอดค่าแรงจ่ายของแต่ละงานในใบจ่าย (ธุรการ/บัญชี) — รวมใบที่จ่ายแล้ว
function EditPayout({ payout, team, jobByNo = {}, onClose, onSaved, flash }) {
  const init = (payout.lines || []).map((l) => ({ ...l, amount: Number(l.amount) || 0 }));
  const [lines, setLines] = React.useState(init);
  const [busy, setBusy] = React.useState(false);
  const setAmt = (i, v) => setLines((ls) => ls.map((l, j) => j === i ? { ...l, amount: Number(v) || 0 } : l));
  const gross = round2(lines.reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const vatBase = round2(lines.filter((l) => l.vat).reduce((a, l) => a + (Number(l.amount) || 0), 0));
  const whtAmt = round2(vatBase * WHT_RATE / 100);
  const net = round2(gross - whtAmt);
  async function save() {
    if (gross <= 0) return flash("ต้องมียอดอย่างน้อย 1 รายการ", true);
    if (!await confirmDialog(`บันทึกแก้ไขใบจ่าย? รวม ${fmtBaht(gross)} − หัก ${fmtBaht(whtAmt)} = สุทธิ ${fmtBaht(net)}\n(ยอดจ่ายสะสม/ค้างจ่ายของงานจะถูกปรับตาม)`)) return;
    setBusy(true);
    try { await updateSubPayout({ id: payout.id, lines, whtRate: WHT_RATE }); flash("แก้ไขใบจ่ายแล้ว ✓"); onSaved(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div className="modal-head"><div className="modal-title">แก้ไขใบจ่ายค่าแรง · ทีม {team.name}{payout.status === "paid" ? <span style={{ color: "var(--down)" }}> · จ่ายแล้ว</span> : ""}</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <p className="page-sub" style={{ marginTop: 0 }}>ปรับยอดค่าแรงที่จ่ายต่อรายการงาน · หัก ณ ที่จ่าย 3% เฉพาะงาน VAT · ยอดจ่ายสะสมของงานจะถูกปรับให้อัตโนมัติ</p>
          {lines.map((l, i) => {
            const j = jobByNo[l.job_no] || {};
            const full = round2(Number(l.total) || Number(j.labor_total) || 0);
            return (
              <div className="sub-pay-job" key={l.job_no} style={{ alignItems: "center" }}>
                <span className="sub-pay-no">{l.job_no} {l.vat ? <span className="vat-badge vat-on">VAT</span> : <span className="vat-badge vat-off">NO VAT</span>}</span>
                <span className="jo-dim" style={{ flex: 1 }}>{l.customerName || j.customerName || "-"}{full > 0 ? ` · เต็ม ${fmtBaht(full)}` : ""}</span>
                <span className="inp inp-unit" style={{ width: 150 }}><span className="unit-pre">฿</span><input type="number" min="0" value={l.amount} onChange={(e) => setAmt(i, e.target.value)} /></span>
              </div>
            );
          })}
          <div className="sub-lab-total" style={{ marginTop: 10 }}><span>รวมค่าแรงงวดนี้</span><b>{fmtBaht(gross)}</b></div>
          <div className="ps-tot"><span>หัก ณ ที่จ่าย {WHT_RATE}% (เฉพาะงาน VAT)</span><b>−{fmtBaht(whtAmt)}</b></div>
          <div className="sub-lab-total"><span>จ่ายสุทธิ</span><b style={{ color: "#16a34a" }}>{fmtBaht(net)}</b></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy || gross <= 0} onClick={save}>บันทึกการแก้ไข</button></div>
      </div>
    </div>
  );
}

// one sub team's payable list + split-payment controls
function PayTeam({ team, list, quoteBy, flash, onCreated }) {
  const [sel, setSel] = React.useState({});
  const [mode, setMode] = React.useState("full"); // full | percent | amount
  const [pct, setPct] = React.useState(100);
  const [amt, setAmt] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const chosen = list.filter((j) => sel[j.job_no]);
  const sumRem = round2(chosen.reduce((a, j) => a + remaining(j), 0));
  // allocation per chosen job
  const alloc = {};
  if (mode === "full") chosen.forEach((j) => { alloc[j.job_no] = remaining(j); });
  else if (mode === "percent") { const p = Math.min(100, Math.max(0, Number(pct) || 0)); chosen.forEach((j) => { alloc[j.job_no] = round2(remaining(j) * p / 100); }); }
  else if (mode === "amount") {
    const T = Math.min(Number(amt) || 0, sumRem); let acc = 0;
    chosen.forEach((j, i) => {
      if (i === chosen.length - 1) alloc[j.job_no] = round2(T - acc);
      else { const a = sumRem > 0 ? round2(T * remaining(j) / sumRem) : 0; alloc[j.job_no] = a; acc = round2(acc + a); }
    });
  }
  const lines = chosen.map((j) => ({ job_no: j.job_no, amount: alloc[j.job_no] || 0, vat: !!quoteBy[j.quote_no]?.vat, total: round2(Number(j.labor_total) || 0), customerName: j.customerName || null }));
  const gross = round2(lines.reduce((a, l) => a + l.amount, 0));
  const vatBase = round2(lines.filter((l) => l.vat).reduce((a, l) => a + l.amount, 0));
  const whtAmt = round2(vatBase * WHT_RATE / 100);
  const net = round2(gross - whtAmt);

  async function create() {
    if (gross <= 0) return flash("เลือกงาน + ระบุยอดที่จะจ่ายก่อน", true);
    if (!await confirmDialog(`สร้างใบรอจ่าย ${chosen.length} งาน · รวม ${fmtBaht(gross)} − หัก ณ ที่จ่าย ${fmtBaht(whtAmt)} = สุทธิ ${fmtBaht(net)} ?`)) return;
    setBusy(true);
    try { await createSubPayout({ team: team.id, lines, whtRate: WHT_RATE }); flash("สร้างใบรอจ่ายแล้ว ✓"); setSel({}); setAmt(""); onCreated(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div className="sub-pay-team">
      <div className="sub-pay-tname">ทีม {team.name}</div>
      {list.map((j) => {
        const rem = remaining(j); const partial = (Number(j.labor_paid_amt) || 0) > 0;
        return (
          <label className="sub-pay-job" key={j.job_no}>
            <input type="checkbox" checked={!!sel[j.job_no]} onChange={(e) => setSel((s) => ({ ...s, [j.job_no]: e.target.checked }))} />
            <span className="sub-pay-no">{j.scheduled_at && <span className="jo-dim" style={{ fontSize: 11, marginRight: 5 }}>{fmtDate(j.scheduled_at)}</span>}{j.job_no} {quoteBy[j.quote_no]?.vat ? <span className="vat-badge vat-on">VAT</span> : <span className="vat-badge vat-off">NO VAT</span>}</span>
            <span className="jo-dim" style={{ flex: 1 }}>{j.customerName || "-"}</span>
            <b>{fmtBaht(rem)}{partial ? <span className="jo-dim" style={{ fontWeight: 400 }}> / {fmtBaht(j.labor_total)}</span> : ""}</b>
          </label>
        );
      })}
      {chosen.length > 0 && (
        <div className="sub-pay-split">
          <div className="sub-split-modes">
            {[["full", "เต็มจำนวน"], ["percent", "ตาม %"], ["amount", "ตามยอดเงิน"]].map(([v, l]) => (
              <button key={v} className={"cat-chip" + (mode === v ? " on" : "")} onClick={() => setMode(v)}
                style={mode === v ? { background: "#1f74e0", color: "#fff", borderColor: "#1f74e0" } : {}}>{l}</button>
            ))}
            {mode === "percent" && <span className="inp inp-unit" style={{ width: 110 }}><input type="number" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} /><span className="unit-suf">%</span></span>}
            {mode === "amount" && <span className="inp inp-unit" style={{ width: 150 }}><span className="unit-pre">฿</span><input type="number" min="0" max={sumRem} value={amt} placeholder={`สูงสุด ${fmtBaht(sumRem)}`} onChange={(e) => setAmt(e.target.value)} /></span>}
          </div>
          <div className="sub-pay-sum">เลือก {chosen.length} งาน · ค้างรวม {fmtBaht(sumRem)} · จ่ายงวดนี้ {fmtBaht(gross)} − หัก ณ ที่จ่าย 3% ({fmtBaht(whtAmt)}) = <b>จ่ายสุทธิ {fmtBaht(net)}</b>
            <button className="btn-primary sm" disabled={busy || gross <= 0} onClick={create}>สร้างใบรอจ่าย</button></div>
        </div>
      )}
    </div>
  );
}

// ---------- payout slip: download (image/pdf) + send to a team chat room ----------
function PayoutSlip({ payout, team, jobByNo = {}, onClose, flash }) {
  const ref = React.useRef(null);
  const [rooms, setRooms] = React.useState([]);
  const [roomId, setRoomId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { listChatRooms().then((r) => { setRooms(r); setRoomId(r[0]?.id || ""); }).catch(() => {}); }, []);
  const rawLines = payout.lines || (payout.job_nos || []).map((n) => ({ job_no: n, amount: null, customerName: null, vat: null }));
  // enrich each line with live job info (phone/address) + this-round / remaining split
  const lines = rawLines.map((l) => {
    const j = jobByNo[l.job_no] || {};
    const full = round2(Number(l.total) || Number(j.labor_total) || 0);
    const thisRound = l.amount == null ? null : round2(Number(l.amount) || 0);
    const paidAll = round2(Number(j.labor_paid_amt) || (thisRound || 0));   // cumulative incl. this round
    const remAfter = round2(Math.max(0, full - paidAll));
    return { ...l, customerName: l.customerName || j.customerName || null, phone: j.contact_phone || null, address: j.address || null,
      title: j.title || null, scheduled_at: j.scheduled_at || null, full, thisRound, remAfter, partial: thisRound != null && (remAfter > 0.01 || thisRound < full - 0.01) };
  });
  const totalRemaining = round2(lines.reduce((a, l) => a + (l.remAfter || 0), 0));
  const anyPartial = lines.some((l) => l.partial);

  async function capture() {
    return html2canvas(ref.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false });
  }
  async function dlPng() {
    setBusy(true);
    try { const c = await capture(); const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `payout-${team.name}-${fmtDate(payout.created_at)}.png`; document.body.appendChild(a); a.click(); a.remove(); }
    catch (e) { flash("สร้างรูปไม่สำเร็จ: " + (e.message || e), true); } setBusy(false);
  }
  async function dlPdf() {
    setBusy(true);
    try {
      const c = await capture(); const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const w = pdf.internal.pageSize.getWidth(); const h = c.height * (w / c.width);
      pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, w, h); pdf.save(`payout-${team.name}.pdf`);
    } catch (e) { flash("สร้าง PDF ไม่สำเร็จ: " + (e.message || e), true); } setBusy(false);
  }
  // ส่งสลิปตรงให้หัวหน้าช่าง: ใช้ Web Share API (มือถือ) → เลือกแอป LINE → เลือกหัวหน้าช่างคนนั้น
  async function shareToLead() {
    setBusy(true);
    try {
      const c = await capture();
      const blob = await new Promise((res) => c.toBlob(res, "image/png"));
      const file = new File([blob], `payout-${team.name}.png`, { type: "image/png" });
      const txt = `📋 สลิปจ่ายค่าแรง · ทีม ${team.name}${team.lead ? ` (หัวหน้า ${team.lead})` : ""}\nรวม ${fmtBaht(payout.gross)} − หัก ณ ที่จ่าย ${fmtBaht(payout.wht_amt)} = จ่ายสุทธิ ${fmtBaht(payout.net)} (${lines.length} งาน)`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "สลิปจ่ายค่าแรงช่างซัพ", text: txt });
        flash("เปิดหน้าต่างแชร์แล้ว — เลือกหัวหน้าช่างได้เลย ✓");
      } else {
        // อุปกรณ์ไม่รองรับแชร์ไฟล์ (เดสก์ท็อปส่วนใหญ่) → ดาวน์โหลดรูปให้แทน
        const a = document.createElement("a"); a.href = c.toDataURL("image/png"); a.download = `payout-${team.name}.png`; document.body.appendChild(a); a.click(); a.remove();
        flash("อุปกรณ์นี้แชร์ตรงไม่ได้ — ดาวน์โหลดรูปให้แล้ว ส่งให้หัวหน้าช่างได้เลย", true);
      }
    } catch (e) { if (e.name !== "AbortError") flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function sendChat() {
    if (!roomId) return flash("เลือกห้องแชตทีมก่อน", true);
    setBusy(true);
    try {
      const c = await capture();
      const blob = await new Promise((res) => c.toBlob(res, "image/png"));
      const file = new File([blob], `payout-${payout.id}.png`, { type: "image/png" });
      const url = await uploadChatImage(file);
      const txt = `📋 สลิปจ่ายค่าแรง · ทีม ${team.name}\nรวม ${fmtBaht(payout.gross)} − หัก ณ ที่จ่าย ${fmtBaht(payout.wht_amt)} = จ่ายสุทธิ ${fmtBaht(payout.net)} (${lines.length} งาน)`;
      await sendChatMessage(roomId, txt);
      await sendChatImage(roomId, url);
      flash("ส่งสลิปเข้าแชตทีมแล้ว ✓"); onClose();
    } catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <div className="modal-head"><div className="modal-title">สลิปจ่ายค่าแรงช่างซัพ</div>
          <button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div ref={ref} className="payout-slip">
            <div className="ps-head"><b>ใบจ่ายค่าแรงช่างซัพ</b><span>{fmtDate(payout.created_at)}</span></div>
            <div className="ps-team">ทีม: {team.name}{team.lead ? ` · หัวหน้า ${team.lead}` : ""}{team.phone ? ` · ${team.phone}` : ""}{team.tax_id ? ` · เลขผู้เสียภาษี ${team.tax_id}` : ""}{team.bank_info ? <div className="ps-bank">บัญชี: {team.bank_info}</div> : null}</div>
            <div className="ps-jobs">
              {lines.map((l, i) => (
                <div className="ps-job" key={i}>
                  <div className="ps-job-top">
                    <span className="ps-job-no">{l.job_no}{l.vat ? <span className="ps-wht-tag">หัก ณ ที่จ่าย 3%</span> : <span className="ps-nowht-tag">ไม่หัก ณ ที่จ่าย</span>}</span>
                    <b className="ps-job-amt">{l.thisRound == null ? "-" : fmtBaht(l.thisRound)}</b>
                  </div>
                  <div className="ps-job-sub">{l.scheduled_at && <span style={{ marginRight: 6 }}>{fmtDate(l.scheduled_at)}</span>}{l.customerName || "-"}{l.title ? ` · ${l.title}` : ""}</div>
                  {(l.phone || l.address) && <div className="ps-job-sub">{l.phone ? `📞 ${l.phone}` : ""}{l.phone && l.address ? " · " : ""}{l.address ? `📍 ${l.address}` : ""}</div>}
                  {l.partial && <div className="ps-job-split">จ่ายงวดนี้ {fmtBaht(l.thisRound)} · คงเหลือค้างจ่าย {fmtBaht(l.remAfter)} (ค่าแรงเต็ม {fmtBaht(l.full)})</div>}
                </div>
              ))}
            </div>
            <div className="ps-tot"><span>รวมค่าแรงงวดนี้</span><b>{fmtBaht(payout.gross)}</b></div>
            <div className="ps-tot"><span>หัก ณ ที่จ่าย {payout.wht_rate || WHT_RATE}% (เฉพาะงาน VAT)</span><b>−{fmtBaht(payout.wht_amt)}</b></div>
            <div className="ps-tot ps-net"><span>ยอดที่ต้องจ่ายงวดนี้ (สุทธิ)</span><b>{fmtBaht(payout.net)}</b></div>
            {anyPartial && totalRemaining > 0.01 && <div className="ps-tot ps-remain"><span>คงเหลือค้างจ่าย (ยกไปงวดหน้า)</span><b>{fmtBaht(totalRemaining)}</b></div>}
            <div className="ps-status">สถานะ: {payout.status === "paid" ? `จ่ายแล้ว ${fmtDate(payout.paid_at)}` : "รอจ่าย"}</div>
          </div>
          {/* ส่งตรงให้หัวหน้าช่างซัพคนนี้ */}
          <div className="ps-lead">
            <div className="ps-lead-info"><b>หัวหน้าช่าง:</b> {team.lead || "—"}{team.phone && <> · <a href={`tel:${team.phone}`}>📞 {team.phone}</a></>}</div>
            <button className="btn-primary sm" disabled={busy} onClick={shareToLead}><UIcon name="chat" size={14} color="#fff" /> 📲 ส่งสลิปให้หัวหน้าช่าง</button>
          </div>
          <div className="fld" style={{ marginTop: 14 }}><span>หรือส่งเข้าห้องแชตทีม</span>
            <select className="inp" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {rooms.length === 0 && <option value="">— ไม่มีห้องแชต —</option>}
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select></div>
        </div>
        <div className="modal-foot" style={{ flexWrap: "wrap", gap: 8 }}>
          <button className="btn-ghost" disabled={busy} onClick={dlPng}><UIcon name="catalog" size={15} /> ดาวน์โหลดรูป</button>
          <button className="btn-ghost" disabled={busy} onClick={dlPdf}><UIcon name="catalog" size={15} /> ดาวน์โหลด PDF</button>
          <button className="btn-primary" disabled={busy || !roomId} onClick={sendChat}><UIcon name="chat" size={15} color="#fff" /> ส่งเข้าแชตทีม</button>
        </div>
      </div>
    </div>
  );
}

// ---------- SCORECARD ----------
function ScoreTab({ jobs, quoteBy, subTeams, matCost, payouts }) {
  const rows = subTeams.map((t) => {
    const tj = jobs.filter((j) => j.assigned_team === t.id);
    const done = tj.filter((j) => j.status === "done");
    const value = round2(done.reduce((a, j) => a + (quoteBy[j.quote_no]?.afterDisc || 0), 0));
    const labor = round2(tj.reduce((a, j) => a + (Number(j.labor_total) || 0), 0));
    const paidPo = payouts.filter((p) => p.team === t.id && p.status === "paid");
    const paid = round2(paidPo.reduce((a, p) => a + (Number(p.net) || 0), 0));        // จ่ายสุทธิจริง
    const wht = round2(paidPo.reduce((a, p) => a + (Number(p.wht_amt) || 0), 0));      // หัก ณ ที่จ่าย ที่หักไปแล้ว
    const paidGross = round2(paidPo.reduce((a, p) => a + (Number(p.gross) || 0), 0));  // ยอดค่าแรงที่เคลียร์แล้ว (สุทธิ+หัก)
    const claims = tj.filter((j) => j.is_claim).length;
    const resched = tj.filter((j) => j.status === "reschedule").length;
    const rated = tj.filter((j) => j.rating > 0);
    const avgRating = rated.length ? round2(rated.reduce((a, j) => a + j.rating, 0) / rated.length) : null;
    let profitSum = 0, profitN = 0;
    done.forEach((j) => { const q = quoteBy[j.quote_no]; if (!q) return; const m = matCost[j.job_no]; const matNet = m ? (m.withdraw - m.return) : 0; profitSum += (q.afterDisc || 0) - matNet - (Number(j.labor_total) || 0); profitN++; });
    const avgProfit = profitN ? round2(profitSum / profitN) : null;
    return { t, jobs: tj.length, done: done.length, value, labor, paid, wht, unpaid: round2(labor - paidGross), claims, resched, avgRating, avgProfit };
  });
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">สกอร์การ์ดทีมช่างซัพ</div><div className="sec-sub">ใช้พิจารณาจ้างต่อ / เพิ่มงาน / ตัดออก</div></div></div>
      <div style={{ overflowX: "auto" }}>
        <table className="hr-table">
          <thead><tr><th style={{ textAlign: "left" }}>ทีม</th><th>งานเสร็จ</th><th>มูลค่างาน</th><th>ค่าแรงรวม</th><th>จ่ายสุทธิแล้ว</th><th>หัก ณ ที่จ่าย</th><th>ค้างจ่าย</th><th>เคลม</th><th>เลื่อนนัด</th><th>คะแนน</th><th>กำไรเฉลี่ย/งาน</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t.id}>
                <td style={{ textAlign: "left" }}><b>{r.t.name}</b></td>
                <td>{r.done}/{r.jobs}</td>
                <td>{fmtBaht(r.value)}</td>
                <td>{fmtBaht(r.labor)}</td>
                <td className="hr-ok">{fmtBaht(r.paid)}</td>
                <td className={r.wht > 0 ? "hr-warn" : ""}>{r.wht > 0 ? fmtBaht(r.wht) : "-"}</td>
                <td className={r.unpaid > 0.01 ? "hr-bad" : "hr-ok"}>{fmtBaht(r.unpaid)}</td>
                <td className={r.claims ? "hr-bad" : ""}>{r.claims}</td>
                <td className={r.resched ? "hr-warn" : ""}>{r.resched}</td>
                <td>{r.avgRating != null ? `★ ${r.avgRating}` : "-"}</td>
                <td className={r.avgProfit != null && r.avgProfit < 0 ? "hr-bad" : "hr-ok"}>{r.avgProfit != null ? fmtBaht(r.avgProfit) : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
