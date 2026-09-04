import React from "react";
import { listFinancings, saveFinancing, deleteFinancing, payFinancingInstallment, uploadLoanFile } from "../lib/api";
import { loanStatus, monthlyOutlook, LOAN_KINDS, LOAN_METHODS, r2 } from "../lib/loans";
import { ASSET_GROUPS } from "../lib/expenseTaxonomy";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";
import { can } from "../lib/permissions";

const thMonth = (d) => d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" });
const thFull = (d) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
const kindIcon = (k) => (k === "office" ? "🏢" : k === "other" ? "📄" : "🚗");
const ASSET_OPTS = [...(ASSET_GROUPS.vehiclePlus || []), ...(ASSET_GROUPS.rent || [])];
const nowM = () => { const d = new Date(); return d.getFullYear() * 12 + d.getMonth(); };

export default function Loans({ role, onGoExpenses, onGoCashflow }) {
  const canEdit = can(role, "loans", "edit");
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [needMig, setNeedMig] = React.useState(false);
  const [edit, setEdit] = React.useState(null);      // loan being added/edited (object) | null
  const [detail, setDetail] = React.useState(null);  // loan whose schedule is open
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 3000); };

  async function load(silent) {
    if (!silent) setLoading(true);
    try { const r = await listFinancings(); setRows(r.rows); setNeedMig(!!r.needMigration); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    if (!silent) setLoading(false);
  }
  React.useEffect(() => { load(); }, []);

  const active = rows.filter((l) => l.active !== false);
  const totalMonthly = r2(active.reduce((s, l) => s + (loanStatus(l).next?.installment || 0), 0));
  const totalPayoff = r2(active.reduce((s, l) => s + loanStatus(l).payoffLeft, 0));
  const totalPrincipal = r2(active.reduce((s, l) => s + loanStatus(l).principalLeft, 0));
  const nm = nowM();
  const dueThisMonth = active.filter((l) => { const n = loanStatus(l).next; return n && (n.due.getFullYear() * 12 + n.due.getMonth()) === nm; });
  const outlook = React.useMemo(() => monthlyOutlook(active, 12), [rows]);
  const outMax = Math.max(1, ...outlook.map((o) => o.amount));

  async function doPay(l) {
    const st = loanStatus(l);
    if (!st.next) return flash("ผ่อนครบทุกงวดแล้ว", true);
    const ok = await confirmDialog({
      title: `จ่ายค่างวด ${l.name}?`,
      message: `งวด ${st.next.seq}/${st.term} · ครบกำหนด ${thFull(st.next.due)}\nยอด ${fmtBaht(l.installment)} → ตั้งใบเบิกในเมนูเบิกจ่าย (แบ่งจ่าย/แนบสลิปได้)`,
      confirmText: "ตั้งเบิกจ่ายงวดนี้",
    });
    if (!ok) return;
    setBusy(true);
    try { const r = await payFinancingInstallment(l.id); flash(`ตั้งเบิกค่างวด ${st.next.seq} แล้ว → ไปจ่ายในเมนูเบิกจ่าย ✓`); await load(true); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  async function doDelete(l) {
    const reason = await confirmDialog({ title: `ลบสัญญา ${l.name}?`, message: "จะลบประมาณการค่างวดในกระแสเงินสดด้วย", confirmText: "ลบ", prompt: { label: "เหตุผล", required: true } });
    if (!reason) return;
    setBusy(true);
    try { await deleteFinancing(l.id); flash("ลบแล้ว"); await load(true); if (detail?.id === l.id) setDetail(null); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <h2 style={{ margin: 0 }}>🏧 หนี้สิน — สินเชื่อ &amp; ค่างวดผ่อน</h2>
          <div className="muted" style={{ fontSize: 13 }}>รวมรถเช่าซื้อ + สินเชื่อ · ตารางผ่อน เงินต้น/หนี้คงเหลือ + ประมาณการจ่ายล่วงหน้าจนหมดงวด</div>
        </div>
        {canEdit && <button className="btn primary" onClick={() => setEdit(blankLoan())}>+ เพิ่มสินเชื่อ</button>}
      </div>

      {needMig && <div className="card" style={{ padding: 14, borderColor: "#b4530955", background: "#b4530912", marginTop: 12 }}>
        ⚠️ ยังใช้เมนูหนี้สินไม่ได้ — ต้องรัน <b>migration 242</b> ใน Supabase ก่อน (สร้างตาราง loans)
      </div>}

      {loading ? <div className="muted" style={{ padding: 30, textAlign: "center" }}>กำลังโหลด…</div> : <>
        {/* สรุป */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, margin: "16px 0" }}>
          <SumCard k="💳 หนี้คงเหลือรวม" v={fmtBaht(totalPayoff)} sub={`เงินต้นคงเหลือ ${fmtBaht(totalPrincipal)}`} accent />
          <SumCard k="📅 ค่างวดรวม/เดือน" v={fmtBaht(totalMonthly)} sub={`${active.length} สัญญา`} />
          <SumCard k="⏰ ครบกำหนดเดือนนี้" v={`${dueThisMonth.length} งวด`} sub={dueThisMonth.length ? fmtBaht(dueThisMonth.reduce((s, l) => s + (loanStatus(l).next?.installment || 0), 0)) : "—"} warn={dueThisMonth.length > 0} />
          <SumCard k="📆 จ่ายรวม 12 เดือนหน้า" v={fmtBaht(r2(outlook.reduce((s, o) => s + o.amount, 0)))} sub="ประมาณการ" />
        </div>

        {/* กราฟประมาณการ 12 เดือน */}
        {active.length > 0 && <div className="card" style={{ padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>ประมาณการค่างวดล่วงหน้า 12 เดือน {onGoCashflow && <button className="btn-link" style={{ fontWeight: 400, fontSize: 12 }} onClick={onGoCashflow}>· ดูในกระแสเงินสด →</button>}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 96 }}>
            {outlook.map((o) => <div key={o.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }} title={`${thMonth(o.date)} · ${fmtBaht(o.amount)}`}>
              <div style={{ width: "100%", maxWidth: 30, height: `${Math.round((o.amount / outMax) * 74)}%`, minHeight: o.amount ? 3 : 0, background: "var(--teal,#0f766e)", borderRadius: "5px 5px 0 0", opacity: 0.88 }} />
              <span style={{ fontSize: 9.5, color: "var(--muted,#889)" }}>{thMonth(o.date)}</span>
            </div>)}
          </div>
        </div>}

        {/* รายการสัญญา */}
        {active.length === 0 && !needMig && <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--muted,#889)" }}>
          ยังไม่มีสัญญาสินเชื่อ {canEdit && <>— กด <b>+ เพิ่มสินเชื่อ</b> เพื่อเริ่ม</>}
        </div>}
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((l) => <LoanRow key={l.id} loan={l} onOpen={() => setDetail(l)} onPay={() => doPay(l)} onEdit={() => setEdit({ ...l })} canEdit={canEdit} busy={busy} />)}
        </div>
      </>}

      {edit && <LoanForm loan={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load(true); flash("บันทึกสัญญาแล้ว ✓"); }} flash={flash} />}
      {detail && <LoanDetail loan={detail} onClose={() => setDetail(null)} onPay={() => doPay(detail)} onDelete={canEdit ? () => doDelete(detail) : null} onEdit={canEdit ? () => { setDetail(null); setEdit({ ...detail }); } : null} onGoExpenses={onGoExpenses} busy={busy} />}
      {toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: toast.bad ? "#b42318" : "#0f766e", color: "#fff", padding: "10px 18px", borderRadius: 10, zIndex: 60, fontSize: 14, boxShadow: "0 6px 20px #0004" }}>{toast.m}</div>}
    </div>
  );
}

function SumCard({ k, v, sub, accent, warn }) {
  return <div className="card" style={{ padding: "14px 16px", ...(accent ? { borderColor: "var(--teal,#0f766e)" } : warn ? { borderColor: "#b45309" } : {}) }}>
    <div style={{ fontSize: 12.5, color: "var(--muted,#667)" }}>{k}</div>
    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 5, letterSpacing: "-.02em", color: warn ? "#b45309" : "inherit" }}>{v}</div>
    {sub && <div style={{ fontSize: 12, color: "var(--muted,#889)", marginTop: 2 }}>{sub}</div>}
  </div>;
}

function LoanRow({ loan, onOpen, onPay, onEdit, canEdit, busy }) {
  const st = loanStatus(loan);
  const pct = st.term ? Math.round((st.paid / st.term) * 100) : 0;
  const done = st.remainInst <= 0;
  const nm = nowM();
  const dueNow = st.next && (st.next.due.getFullYear() * 12 + st.next.due.getMonth()) <= nm;
  return <div className="card" style={{ padding: "12px 14px", opacity: loan.active === false ? 0.55 : 1 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 220px", minWidth: 0, cursor: "pointer" }} onClick={onOpen}>
        <div style={{ width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--teal-soft,#0f766e18)", fontSize: 17, flex: "none" }}>{kindIcon(loan.kind)}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loan.name}{(loan.attachments || []).length > 0 && <span title="มีไฟล์สัญญาแนบ" style={{ marginLeft: 5, fontSize: 12 }}>📎</span>}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted,#889)" }}>{LOAN_METHODS[loan.method] || loan.method}{loan.lender ? " · " + loan.lender : ""}{loan.active === false ? " · ปิดแล้ว" : ""}</div>
        </div>
      </div>
      <div style={{ textAlign: "right", flex: "0 0 auto", minWidth: 96 }}>
        <div style={{ fontSize: 11, color: "var(--muted,#889)" }}>ค่างวด/เดือน</div>
        <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(st.next ? st.next.installment : loan.installment)}{st.stepped && <span style={{ fontSize: 10, fontWeight: 400, color: "var(--muted,#889)" }}> ขั้นบันได</span>}</div>
      </div>
      <div style={{ flex: "0 0 auto", minWidth: 150 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted,#889)" }}>
          <span>งวด {st.paid}/{st.term}</span><span>เหลือ {st.remainInst}</span>
        </div>
        <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", fontSize: 13.5 }}>{fmtBaht(st.payoffLeft)} <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted,#889)" }}>คงเหลือ</span></div>
        <div style={{ height: 6, borderRadius: 99, background: "var(--line,#e3e8ee)", overflow: "hidden", marginTop: 4 }}><div style={{ height: "100%", width: `${pct}%`, background: "var(--teal,#0f766e)", borderRadius: 99 }} /></div>
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6 }}>
        {done ? <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "var(--teal-soft,#0f766e18)", color: "var(--teal,#0f766e)" }}>ผ่อนครบ ✓</span>
          : <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: dueNow ? "#b4530915" : "var(--line,#eef)", color: dueNow ? "#b45309" : "var(--muted,#667)", whiteSpace: "nowrap" }}>{st.next ? thFull(st.next.due) : "—"}</span>}
        {canEdit && !done && <button className="btn sm" disabled={busy} onClick={onPay} title="ตั้งเบิกค่างวดถัดไป">จ่ายงวด</button>}
        {canEdit && <button className="btn-icon sm" onClick={onEdit} title="แก้ไข">✏️</button>}
      </div>
    </div>
  </div>;
}

function LoanDetail({ loan, onClose, onPay, onDelete, onEdit, onGoExpenses, busy }) {
  const st = loanStatus(loan);
  const sched = st.sched;
  // โฟกัสรอบ ๆ งวดปัจจุบัน
  const [showAll, setShowAll] = React.useState(false);
  const from = showAll ? 0 : Math.max(0, st.paid - 3);
  const to = showAll ? sched.length : Math.min(sched.length, st.paid + 9);
  const view = sched.slice(from, to);
  return <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "auto", padding: "24px 12px" }} onClick={onClose}>
    <div className="card" style={{ maxWidth: 720, width: "100%", padding: 0, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: "16px 18px", background: "var(--teal-soft,#0f766e12)", borderBottom: "1px solid var(--line,#e3e8ee)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{kindIcon(loan.kind)} {loan.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted,#778)", marginTop: 2 }}>
              {LOAN_METHODS[loan.method] || loan.method}{loan.lender ? " · " + loan.lender : ""}{loan.contract_no ? " · สัญญา " + loan.contract_no : ""}
              {loan.principal ? ` · ยอดจัด ${fmtBaht(loan.principal)}` : ""}{loan.method === "reducing" && loan.rate ? ` · ${loan.rate}%/ปี` : ""}
            </div>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
          {st.principalLeft != null && <Fact l="เงินต้นคงเหลือ" n={fmtBaht(st.principalLeft)} />}
          {st.stepped && st.opening > 0 && <Fact l="เงินต้นตั้งต้น" n={fmtBaht(st.opening)} />}
          <Fact l="หนี้ที่ต้องจ่ายอีก" n={fmtBaht(st.payoffLeft) + (st.stepped && !(Number(loan.balloon) > 0) ? " +บอลลูน" : "")} />
          {st.interestLeft != null && <Fact l="ดอกเบี้ยคงเหลือ" n={fmtBaht(st.interestLeft)} />}
          <Fact l="งวด" n={`${st.paid}/${st.term} · เหลือ ${st.remainInst}`} />
          <Fact l="ผ่อนหมด" n={st.last ? thFull(st.last.due) : "—"} />
        </div>
        <AttachChips items={loan.attachments} />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>ตารางผ่อน {showAll ? "(ทั้งสัญญา)" : "(รอบงวดปัจจุบัน)"}</div>
        <button className="btn-link" style={{ fontSize: 12 }} onClick={() => setShowAll((v) => !v)}>{showAll ? "ย่อ" : `ดูทั้งหมด ${sched.length} งวด`}</button>
      </div>
      <div style={{ overflowX: "auto", maxHeight: 360, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 520 }}>
          <thead><tr style={{ position: "sticky", top: 0, background: "var(--panel2,#f6f8fa)" }}>
            {["งวด", "ครบกำหนด", "ค่างวด", "ดอกเบี้ย", "เงินต้น", st.stepped ? "ยอดจ่ายคงเหลือ" : "เงินต้นคงเหลือ", ""].map((h, i) => <th key={i} style={{ textAlign: i <= 1 ? (i === 0 ? "center" : "left") : "right", padding: "7px 12px", color: "var(--muted,#778)", fontWeight: 600, fontSize: 11, borderBottom: "1px solid var(--line,#e3e8ee)", whiteSpace: "nowrap" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {view.map((r) => { const paid = r.seq <= st.paid; const isNext = r.seq === st.paid + 1; return <tr key={r.seq} style={{ background: isNext ? "var(--teal-soft,#0f766e14)" : "transparent" }}>
              <td style={{ textAlign: "center", padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", color: paid ? "var(--muted,#99a)" : "inherit" }}>{r.seq}</td>
              <td style={{ padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", fontWeight: isNext ? 700 : 400, color: isNext ? "var(--teal,#0f766e)" : paid ? "var(--muted,#99a)" : "inherit", whiteSpace: "nowrap" }}>{thFull(r.due)}</td>
              <td style={{ textAlign: "right", padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(r.installment)}</td>
              <td style={{ textAlign: "right", padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", fontVariantNumeric: "tabular-nums", color: "var(--muted,#99a)" }}>{r.interest == null ? "—" : fmtBaht(r.interest)}</td>
              <td style={{ textAlign: "right", padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", fontVariantNumeric: "tabular-nums" }}>{r.principal == null ? "—" : fmtBaht(r.principal)}</td>
              <td style={{ textAlign: "right", padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtBaht(r.balance)}</td>
              <td style={{ textAlign: "center", padding: "6px 8px", borderBottom: "1px solid var(--line,#eef)", fontSize: 10.5 }}>{r.balloon ? <span style={{ color: "#b45309", fontWeight: 700 }}>🎈 บอลลูน</span> : paid ? <span style={{ color: "var(--teal,#0f766e)" }}>จ่ายแล้ว</span> : isNext ? <span style={{ color: "#b45309", fontWeight: 600 }}>งวดถัดไป</span> : <span style={{ color: "var(--muted,#aab)" }}>ประมาณการ</span>}</td>
            </tr>; })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--line,#e3e8ee)", flexWrap: "wrap", alignItems: "center" }}>
        {st.remainInst > 0 && <button className="btn primary" disabled={busy} onClick={onPay}>💸 ตั้งเบิกจ่ายงวด {st.paid + 1}</button>}
        {onGoExpenses && <button className="btn" onClick={onGoExpenses}>ไปเมนูเบิกจ่าย →</button>}
        <div style={{ flex: 1 }} />
        {onEdit && <button className="btn sm" onClick={onEdit}>✏️ แก้ไข</button>}
        {onDelete && <button className="btn sm danger" onClick={onDelete}>ลบ</button>}
      </div>
    </div>
  </div>;
}
function Fact({ l, n }) { return <div><div style={{ fontSize: 11, color: "var(--muted,#889)" }}>{l}</div><div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{n}</div></div>; }

function blankLoan() { return { name: "", kind: "vehicle", method: "flat", entity: "company", asset_tag: "", lender: "", contract_no: "", principal: "", rate: "", installment: "", vat_per: "", term_months: "", start_date: "", due_day: 5, paid_count: 0, steps: [], balloon: "", note: "", attachments: [], active: true }; }

const fileIcon = (a) => (/\.pdf($|\?)/i.test(a.url || "") ? "📄" : /\.(png|jpe?g|gif|webp|heic)($|\?)/i.test(a.url || "") ? "🖼️" : "📎");
function AttachChips({ items }) {
  if (!items || !items.length) return null;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
    {items.map((a, i) => <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "4px 9px", borderRadius: 8, background: "var(--panel2,#f2f5f8)", border: "1px solid var(--line,#e3e8ee)", textDecoration: "none", color: "inherit", maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fileIcon(a)} {a.name || "เอกสาร"}</a>)}
  </div>;
}

function LoanForm({ loan, onClose, onSaved, flash }) {
  const [f, setF] = React.useState(loan);
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  // พรีวิวสด
  const preview = React.useMemo(() => {
    try { if (!f.installment || !f.term_months) return null; return loanStatus({ ...f, principal: f.principal || 0, rate: f.rate || 0 }); } catch { return null; }
  }, [f]);

  async function save() {
    if (!f.name.trim()) return flash("ใส่ชื่อสัญญา", true);
    if (f.method === "stepped") { if (!((f.steps || []).some((s) => Number(s.amount) > 0) || Number(f.balloon) > 0)) return flash("ใส่ค่างวดขั้นบันไดอย่างน้อย 1 ช่วง", true); }
    else if (!(Number(f.installment) > 0)) return flash("ใส่ค่างวด/เดือน", true);
    if (!(Number(f.term_months) > 0)) return flash("ใส่จำนวนงวด", true);
    if (!f.start_date) return flash("ใส่วันครบกำหนดงวดแรก", true);
    setBusy(true);
    try { await saveFinancing(f); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); setBusy(false); }
  }

  return <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 75, display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "auto", padding: "24px 12px" }} onClick={onClose}>
    <div className="card" style={{ maxWidth: 560, width: "100%", padding: 20 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{loan.id ? "แก้ไขสัญญา" : "เพิ่มสินเชื่อ"}</h3>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <Row label="ชื่อสัญญา *"><input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น SUZUKI 4ฒฌ2292 / สินเชื่อออฟฟิศ 93/97" /></Row>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Row label="ประเภท"><select className="inp" value={f.kind} onChange={(e) => set("kind", e.target.value)}>{Object.entries(LOAN_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Row>
          <Row label="วิธีคิดดอกเบี้ย"><select className="inp" value={f.method} onChange={(e) => set("method", e.target.value)}>{Object.entries(LOAN_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Row>
          <Row label="กิจการ (ลงกระแสเงินสด)"><select className="inp" value={f.entity || "company"} onChange={(e) => set("entity", e.target.value)}><option value="company">🏢 บริษัท</option><option value="personal">👤 บุคคล</option></select></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="รายการย่อย (รถ/สถานที่)"><input className="inp" list="loan-assets" value={f.asset_tag || ""} onChange={(e) => set("asset_tag", e.target.value)} placeholder="ทะเบียนรถ / สถานที่" /><datalist id="loan-assets">{ASSET_OPTS.map((a) => <option key={a} value={a} />)}</datalist></Row>
          <Row label="ไฟแนนซ์/ธนาคาร"><input className="inp" value={f.lender || ""} onChange={(e) => set("lender", e.target.value)} placeholder="เช่น กรุงศรี ออโต้" /></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="ยอดจัด/เงินต้นตั้งต้น"><input className="inp" type="number" value={f.principal} onChange={(e) => set("principal", e.target.value)} placeholder={f.method === "reducing" ? "จำเป็น (opening)" : "ถ้าไม่รู้เว้นได้"} /></Row>
          {f.method === "reducing"
            ? <Row label="ดอกเบี้ย %/ปี"><input className="inp" type="number" step="0.0001" value={f.rate} onChange={(e) => set("rate", e.target.value)} placeholder="เช่น 6.5" /></Row>
            : <Row label="เลขสัญญา"><input className="inp" value={f.contract_no || ""} onChange={(e) => set("contract_no", e.target.value)} placeholder="ไม่บังคับ" /></Row>}
        </div>
        {f.method === "stepped" ? <StepsEditor f={f} set={set} /> : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="ค่างวด/เดือน (รวม VAT) *"><input className="inp" type="number" value={f.installment} onChange={(e) => set("installment", e.target.value)} placeholder="เช่น 6105" /></Row>
          <Row label="VAT ต่องวด (ถ้ามี)"><input className="inp" type="number" step="0.01" value={f.vat_per} onChange={(e) => set("vat_per", e.target.value)} placeholder="เช่น 399.39" /></Row>
        </div>}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Row label="จำนวนงวดทั้งหมด *"><input className="inp" type="number" value={f.term_months} onChange={(e) => set("term_months", e.target.value)} placeholder="เช่น 72" /></Row>
          <Row label="จ่ายไปแล้ว (งวด)"><input className="inp" type="number" value={f.paid_count} onChange={(e) => set("paid_count", e.target.value)} /></Row>
          <Row label="วันครบกำหนด (31=สิ้นเดือน)"><input className="inp" type="number" min="1" max="31" value={f.due_day} onChange={(e) => set("due_day", e.target.value)} /></Row>
        </div>
        <Row label="วันครบกำหนดงวดแรก (งวด 1) *"><input className="inp" type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} /></Row>
        <Row label="หมายเหตุ"><input className="inp" value={f.note || ""} onChange={(e) => set("note", e.target.value)} /></Row>
        <div>
          <div style={{ fontSize: 12, color: "var(--muted,#778)", marginBottom: 4 }}>📎 ไฟล์สัญญา/เอกสาร (PDF หรือรูป)</div>
          {(f.attachments || []).length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 6 }}>
            {(f.attachments || []).map((a, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
              <a href={a.url} target="_blank" rel="noreferrer" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileIcon(a)} {a.name || "เอกสาร"}</a>
              <button className="btn-icon sm" title="ลบไฟล์นี้" onClick={() => set("attachments", (f.attachments || []).filter((_, j) => j !== i))}>✕</button>
            </div>)}
          </div>}
          <label className="btn sm" style={{ cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? "กำลังอัปโหลด…" : "+ แนบไฟล์"}
            <input type="file" accept="application/pdf,image/*" hidden disabled={uploading} onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return;
              setUploading(true);
              try { const a = await uploadLoanFile(file); set("attachments", [...(f.attachments || []), a]); }
              catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
              setUploading(false); e.target.value = "";
            }} />
          </label>
        </div>
        {loan.id && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={f.active !== false} onChange={(e) => set("active", e.target.checked)} /> สัญญายังใช้งาน (ยังผ่อนอยู่)</label>}

        {preview && <div style={{ background: "var(--panel2,#f6f8fa)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          <b>พรีวิว:</b> เงินต้นคงเหลือ {fmtBaht(preview.principalLeft)} · หนี้คงเหลือ {fmtBaht(preview.payoffLeft)} · งวดถัดไป {preview.next ? `${preview.next.seq}/${preview.term} (${thFull(preview.next.due)})` : "—"}
          {f.method === "reducing" && f.principal && f.rate ? <div style={{ marginTop: 3, color: "var(--muted,#889)" }}>ดอกงวดถัดไป ~{fmtBaht(preview.next?.interest || 0)} · เงินต้น ~{fmtBaht(preview.next?.principal || 0)}</div> : null}
        </div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
    </div>
  </div>;
}
function Row({ label, children }) { return <label style={{ display: "block" }}><div style={{ fontSize: 12, color: "var(--muted,#778)", marginBottom: 3 }}>{label}</div>{children}</label>; }

// ตัวแก้ค่างวดขั้นบันได (ปรับโครงสร้าง/บอลลูน) — แต่ละแถว = ช่วงงวด from–to จ่ายเท่ากัน + งวดสุดท้ายบอลลูน
function StepsEditor({ f, set }) {
  const steps = Array.isArray(f.steps) ? f.steps : [];
  const upd = (i, k, v) => set("steps", steps.map((s, j) => j === i ? { ...s, [k]: v === "" ? "" : Number(v) } : s));
  const add = () => { const last = steps[steps.length - 1]; const nf = last ? (Number(last.to) || 0) + 1 : 1; set("steps", [...steps, { from: nf, to: nf, amount: "" }]); };
  const del = (i) => set("steps", steps.filter((_, j) => j !== i));
  return <div style={{ background: "var(--panel2,#f6f8fa)", borderRadius: 10, padding: "10px 12px" }}>
    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>ค่างวดขั้นบันได (ช่วงงวดที่จ่ายเท่ากัน)</div>
    <div style={{ display: "grid", gap: 6 }}>
      {steps.map((s, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "auto auto 1fr auto", gap: 6, alignItems: "center" }}>
        <input className="inp" type="number" style={{ width: 62 }} value={s.from} onChange={(e) => upd(i, "from", e.target.value)} placeholder="งวด" title="งวดเริ่ม" />
        <input className="inp" type="number" style={{ width: 62 }} value={s.to} onChange={(e) => upd(i, "to", e.target.value)} placeholder="ถึง" title="งวดสุดท้ายของช่วง" />
        <input className="inp" type="number" value={s.amount} onChange={(e) => upd(i, "amount", e.target.value)} placeholder="ค่างวด/เดือน" />
        <button className="btn-icon sm" onClick={() => del(i)} title="ลบช่วง">✕</button>
      </div>)}
    </div>
    <button className="btn sm" style={{ marginTop: 6 }} onClick={add}>+ เพิ่มช่วง</button>
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 4, marginTop: 10 }}>
      <Row label="งวดสุดท้ายจ่ายก้อนใหญ่ (บอลลูน) — ถ้ายังไม่รู้ยอดเว้นได้"><input className="inp" type="number" value={f.balloon} onChange={(e) => set("balloon", e.target.value)} placeholder="ยอดบอลลูนงวดสุดท้าย" /></Row>
    </div>
  </div>;
}
