import React from "react";
import { listJobOrders, listTeams, listQuotations, listSubPayouts, jobMaterialCost, saveJobLabor, saveJobReview, createSubPayout, paySubPayout } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht, round2 } from "../lib/format";
import { UIcon } from "../icons";

const TABS = [["labor", "ค่าแรง/งาน"], ["pay", "จ่ายเงิน"], ["score", "สกอร์การ์ดทีม"]];
const WHT_RATE = 3;

// labor lines default to rate% of each line's sale amount (accounting can edit)
function buildLines(items, rate) {
  return (items || []).map((it) => {
    const qty = Number(it.qty) || 0, price = Number(it.unit_price) || 0;
    const sale = round2(qty * price);
    return { code: it.item_code || null, name: it.name, qty, unit: it.unit || "", price, sale, labor: round2(sale * (Number(rate) || 0) / 100) };
  });
}
const sumLabor = (lines) => round2((lines || []).reduce((a, l) => a + (Number(l.labor) || 0), 0));

export default function Subcontractor({ role }) {
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
        <p className="page-sub">ค่าแรงเหมาต่องาน · จ่ายเงิน (หัก ณ ที่จ่าย 3% เฉพาะงาน VAT) · สถิติทีม</p></div></div>

      {subTeams.length === 0 && <div className="card"><div className="empty">ยังไม่มีทีมช่างซัพ — ไปตั้งค่าได้ที่ ตั้งค่า → ทีมช่าง แล้วเลือกประเภท "ช่างซัพ"</div></div>}

      {subTeams.length > 0 && <>
        <div className="cat-filter">
          {TABS.map(([v, l]) => <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
            style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>)}
        </div>

        {tab === "labor" && <LaborTab jobs={subJobs} quoteBy={quoteBy} teamById={teamById} onReload={load} flash={flash} />}
        {tab === "pay" && <PayTab jobs={subJobs} quoteBy={quoteBy} subTeams={subTeams} payouts={payouts} onReload={load} flash={flash} />}
        {tab === "score" && <ScoreTab jobs={subJobs} quoteBy={quoteBy} subTeams={subTeams} matCost={matCost} payouts={payouts} />}
      </>}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

// ---------- LABOR per job ----------
function LaborTab({ jobs, quoteBy, teamById, onReload, flash }) {
  const [edit, setEdit] = React.useState(null); // job being edited
  const STATUS = { done: { t: "เสร็จ", c: "b-green" }, in_progress: { t: "กำลังทำ", c: "b-amber" }, scheduled: { t: "นัดแล้ว", c: "b-blue" }, pending: { t: "รอจ่ายงาน", c: "b-grey" }, awaiting_approval: { t: "รออนุมัติ", c: "b-purple" }, reschedule: { t: "นัดเพิ่ม", c: "b-orange" } };
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">ค่าแรงเหมาต่องาน</div><div className="sec-sub">กดที่งานเพื่อกรอกค่าแรงรายบรรทัด (ดีฟอลต์ = % ของราคาขายตามอัตราทีม)</div></div></div>
      <div className="set-list">
        {jobs.length === 0 && <div className="empty sm">ยังไม่มีงานของทีมช่างซัพ</div>}
        {jobs.map((j) => { const q = quoteBy[j.quote_no]; const st = STATUS[j.status] || STATUS.pending; return (
          <div className="sub-job-row" key={j.job_no}>
            <div className="sub-job-main">
              <div><b>{j.job_no}</b> <span className={"job-badge " + st.c}>{st.t}</span>
                {q?.vat ? <span className="vat-badge vat-on">VAT</span> : <span className="vat-badge vat-off">NO VAT</span>}
                {j.labor_paid && <span className="vat-badge" style={{ background: "#e6efff", color: "#1d4ed8" }}>จ่ายแล้ว</span>}
                {j.is_claim && <span className="vat-badge vat-off">เคลม</span>}</div>
              <div className="jo-dim">{j.customerName || "-"} · ทีม {teamById[j.assigned_team]?.name || j.assigned_team} · {j.title || "งาน"}</div>
            </div>
            <div className="sub-job-amt">
              <span>มูลค่างาน <b>{fmtBaht(q?.afterDisc || 0)}</b></span>
              <span>ค่าแรง <b className={j.labor_total > 0 ? "" : "hr-warn"}>{j.labor_total > 0 ? fmtBaht(j.labor_total) : "ยังไม่กรอก"}</b></span>
            </div>
            <button className="btn-ghost sm" disabled={j.labor_paid} onClick={() => setEdit(j)}>{j.labor_paid ? "จ่ายแล้ว" : "กรอกค่าแรง"}</button>
          </div>
        ); })}
      </div>
      {edit && <LaborEditor job={edit} quote={quoteBy[edit.quote_no]} rate={teamById[edit.assigned_team]?.payout_rate ?? 80} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onReload(); }} flash={flash} />}
    </div>
  );
}

function LaborEditor({ job, quote, rate, onClose, onSaved, flash }) {
  // always rebuild from the quote (keeps qty/price/หน่วย), then overlay any saved labor amounts by line
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
  async function save() {
    setBusy(true);
    try { await saveJobLabor(job.job_no, lines, total); await saveJobReview(job.job_no, rating || null, claim); flash("บันทึกค่าแรงแล้ว ✓"); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
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
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>บันทึก</button></div>
      </div>
    </div>
  );
}

// ---------- PAYOUT ----------
function PayTab({ jobs, quoteBy, subTeams, payouts, onReload, flash }) {
  const [sel, setSel] = React.useState({}); // job_no → true
  const [busy, setBusy] = React.useState(false);
  const payable = jobs.filter((j) => j.status === "done" && j.labor_total > 0 && !j.labor_paid);
  const byTeam = {}; payable.forEach((j) => { (byTeam[j.assigned_team] = byTeam[j.assigned_team] || []).push(j); });

  async function pay(teamId, list) {
    const chosen = list.filter((j) => sel[j.job_no]);
    if (!chosen.length) return flash("เลือกงานที่จะจ่ายก่อน", true);
    const gross = round2(chosen.reduce((a, j) => a + (Number(j.labor_total) || 0), 0));
    const vatBase = round2(chosen.filter((j) => quoteBy[j.quote_no]?.vat).reduce((a, j) => a + (Number(j.labor_total) || 0), 0));
    const whtAmt = round2(vatBase * WHT_RATE / 100);
    const net = round2(gross - whtAmt);
    if (!await confirmDialog(`สร้างใบจ่าย ${chosen.length} งาน · รวม ${fmtBaht(gross)} − หัก ณ ที่จ่าย ${fmtBaht(whtAmt)} = จ่ายสุทธิ ${fmtBaht(net)} ?`)) return;
    setBusy(true);
    try { await createSubPayout({ team: teamId, jobNos: chosen.map((j) => j.job_no), gross, whtRate: WHT_RATE, whtAmt, net }); flash("สร้างใบจ่ายแล้ว ✓"); setSel({}); onReload(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function markPaid(p) { if (!await confirmDialog(`ยืนยันจ่ายเงินแล้ว ${fmtBaht(p.net)} ?`)) return; try { await paySubPayout(p.id, "โอนเงิน"); flash("บันทึกจ่ายแล้ว"); onReload(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }
  const teamName = (id) => subTeams.find((t) => t.id === id)?.name || id;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sec-head"><div><div className="sec-title">งานที่รอจ่าย (เสร็จแล้ว · กรอกค่าแรงแล้ว)</div></div></div>
        {Object.keys(byTeam).length === 0 && <div className="empty sm">ไม่มีงานค้างจ่าย</div>}
        {Object.entries(byTeam).map(([teamId, list]) => {
          const chosen = list.filter((j) => sel[j.job_no]);
          const gross = round2(chosen.reduce((a, j) => a + (Number(j.labor_total) || 0), 0));
          const vatBase = round2(chosen.filter((j) => quoteBy[j.quote_no]?.vat).reduce((a, j) => a + (Number(j.labor_total) || 0), 0));
          const whtAmt = round2(vatBase * WHT_RATE / 100);
          return (
            <div className="sub-pay-team" key={teamId}>
              <div className="sub-pay-tname">ทีม {teamName(teamId)}</div>
              {list.map((j) => (
                <label className="sub-pay-job" key={j.job_no}>
                  <input type="checkbox" checked={!!sel[j.job_no]} onChange={(e) => setSel((s) => ({ ...s, [j.job_no]: e.target.checked }))} />
                  <span className="sub-pay-no">{j.job_no} {quoteBy[j.quote_no]?.vat ? <span className="vat-badge vat-on">VAT</span> : <span className="vat-badge vat-off">NO VAT</span>}</span>
                  <span className="jo-dim" style={{ flex: 1 }}>{j.customerName || "-"}</span>
                  <b>{fmtBaht(j.labor_total)}</b>
                </label>
              ))}
              {chosen.length > 0 && <div className="sub-pay-sum">เลือก {chosen.length} งาน · รวม {fmtBaht(gross)} − หัก ณ ที่จ่าย 3% ({fmtBaht(whtAmt)}) = <b>จ่ายสุทธิ {fmtBaht(gross - whtAmt)}</b>
                <button className="btn-primary sm" disabled={busy} onClick={() => pay(teamId, list)}>สร้างใบจ่าย</button></div>}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="sec-head"><div><div className="sec-title">ใบจ่ายช่างซัพ</div></div></div>
        <div className="set-list">
          {payouts.length === 0 && <div className="empty sm">ยังไม่มีใบจ่าย</div>}
          {payouts.map((p) => (
            <div className="sub-payout-row" key={p.id}>
              <div><b>ทีม {teamName(p.team)}</b> · {p.job_nos.length} งาน
                <div className="jo-dim">รวม {fmtBaht(p.gross)} − หัก {fmtBaht(p.wht_amt)} = สุทธิ {fmtBaht(p.net)}{p.paid_at ? ` · จ่าย ${new Date(p.paid_at).toLocaleDateString("th-TH")}` : ""}</div></div>
              {p.status === "paid" ? <span className="job-badge b-green">จ่ายแล้ว</span>
                : <button className="btn-primary sm ok" onClick={() => markPaid(p)}>บันทึกจ่ายเงิน</button>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------- SCORECARD ----------
function ScoreTab({ jobs, quoteBy, subTeams, matCost, payouts }) {
  const rows = subTeams.map((t) => {
    const tj = jobs.filter((j) => j.assigned_team === t.id);
    const done = tj.filter((j) => j.status === "done");
    const value = round2(done.reduce((a, j) => a + (quoteBy[j.quote_no]?.afterDisc || 0), 0));
    const labor = round2(tj.reduce((a, j) => a + (Number(j.labor_total) || 0), 0));
    const paid = round2(payouts.filter((p) => p.team === t.id && p.status === "paid").reduce((a, p) => a + (Number(p.net) || 0), 0));
    const claims = tj.filter((j) => j.is_claim).length;
    const resched = tj.filter((j) => j.status === "reschedule").length;
    const rated = tj.filter((j) => j.rating > 0);
    const avgRating = rated.length ? round2(rated.reduce((a, j) => a + j.rating, 0) / rated.length) : null;
    // avg profit/job = sale − material(net) − labor, over done jobs with a quote
    let profitSum = 0, profitN = 0;
    done.forEach((j) => { const q = quoteBy[j.quote_no]; if (!q) return; const m = matCost[j.job_no]; const matNet = m ? (m.withdraw - m.return) : 0; profitSum += (q.afterDisc || 0) - matNet - (Number(j.labor_total) || 0); profitN++; });
    const avgProfit = profitN ? round2(profitSum / profitN) : null;
    return { t, jobs: tj.length, done: done.length, value, labor, paid, unpaid: round2(labor - paid), claims, resched, avgRating, avgProfit };
  });
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">สกอร์การ์ดทีมช่างซัพ</div><div className="sec-sub">ใช้พิจารณาจ้างต่อ / เพิ่มงาน / ตัดออก</div></div></div>
      <div style={{ overflowX: "auto" }}>
        <table className="hr-table">
          <thead><tr><th style={{ textAlign: "left" }}>ทีม</th><th>งานเสร็จ</th><th>มูลค่างาน</th><th>ค่าแรงรวม</th><th>จ่ายแล้ว</th><th>ค้างจ่าย</th><th>เคลม</th><th>เลื่อนนัด</th><th>คะแนน</th><th>กำไรเฉลี่ย/งาน</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t.id}>
                <td style={{ textAlign: "left" }}><b>{r.t.name}</b></td>
                <td>{r.done}/{r.jobs}</td>
                <td>{fmtBaht(r.value)}</td>
                <td>{fmtBaht(r.labor)}</td>
                <td className="hr-ok">{fmtBaht(r.paid)}</td>
                <td className={r.unpaid > 0 ? "hr-warn" : ""}>{fmtBaht(r.unpaid)}</td>
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
