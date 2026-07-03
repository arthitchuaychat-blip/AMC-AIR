import React from "react";
import { listAccounts, listAccountEntries, transferFunds, listTransfers, updateTransfer, deleteTransfer, addAccountEntry, deleteAccountEntry, setEntriesReconciled, setAccountOpening, syncBankReceipts, listExpenseCategories, addExpenseCategory, uploadExpenseFile, submitExpense, listMyExpenses, listExpenses, decideExpense, payExpense, listJobOrders } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import AttachThumb from "./AttachThumb";
import { fmtBaht, ATTACH_ACCEPT } from "../lib/format";
import { UIcon } from "../icons";

const OFFICE = ["admin", "exec", "finance", "hr"]; // hr: อนุมัติ/จ่ายเบิก + คุมเงินสดย่อย (v249)
const EST = { pending: { t: "รออนุมัติ", c: "b-amber" }, approved: { t: "อนุมัติ · รอจ่าย", c: "b-blue" }, rejected: { t: "ไม่อนุมัติ", c: "b-red" }, paid: { t: "จ่ายแล้ว", c: "b-green" } };
const fmtD = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
const today = () => new Date().toISOString().slice(0, 10);

// multi-file attach (bills / evidence)
function AttachRow({ files, onChange, flash, label }) {
  const inp = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  async function pick(e) {
    const list = Array.from(e.target.files || []); e.target.value = "";
    if (!list.length) return; setBusy(true);
    try { const urls = []; for (const f of list) urls.push(await uploadExpenseFile(f)); onChange([...(files || []), ...urls]); }
    catch (err) { flash("อัปโหลดไม่สำเร็จ: " + (err.message || err), true); }
    setBusy(false);
  }
  return (
    <div className="tb-attach">
      <div className="tb-attach-grid">
        {(files || []).map((u, i) => (<div className="tb-att" key={i}><AttachThumb url={u} /><button type="button" className="tb-att-x" onClick={() => onChange(files.filter((_, j) => j !== i))}><UIcon name="x" size={12} /></button></div>))}
      </div>
      <input ref={inp} type="file" accept={ATTACH_ACCEPT} multiple hidden onChange={pick} />
      <button type="button" className="btn-ghost sm" disabled={busy} onClick={() => inp.current?.click()}><UIcon name="plus" size={13} /> {busy ? "กำลังอัปโหลด…" : (label || "แนบบิล/หลักฐาน")}</button>
    </div>
  );
}

// เลือกหมวดค่าใช้จ่าย + สร้างหมวดใหม่ได้ทันที (self-contained: โหลด/รีโหลดรายการหมวดเอง)
function CategoryPicker({ value, onChange, flash }) {
  const [cats, setCats] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const load = () => listExpenseCategories().then(setCats).catch(() => {});
  React.useEffect(() => { load(); }, []);
  async function add() {
    const nm = name.trim(); if (!nm) return;
    try { await addExpenseCategory(nm); await load(); onChange(nm); setAdding(false); setName(""); }
    catch (e) { flash && flash("เพิ่มหมวดไม่สำเร็จ (รัน migration 094 หรือยัง?): " + (e.message || e), true); }
  }
  if (adding) return (
    <div style={{ display: "flex", gap: 6 }}>
      <input className="inp" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อหมวดใหม่ เช่น ค่าขนส่ง" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button type="button" className="btn-primary sm" onClick={add}>เพิ่ม</button>
      <button type="button" className="btn-ghost sm" onClick={() => { setAdding(false); setName(""); }}>ยกเลิก</button>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select className="inp" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— ไม่ระบุหมวด —</option>
        {value && !cats.includes(value) && <option value={value}>{value}</option>}
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" className="btn-ghost sm" title="สร้างหมวดใหม่" onClick={() => setAdding(true)}><UIcon name="plus" size={14} /> หมวดใหม่</button>
    </div>
  );
}

export default function Expenses({ role, me }) {
  const office = OFFICE.includes(role);
  const TABS = [["mine", "ขอเบิกของฉัน"], ...(office ? [["approve", "อนุมัติ / จ่าย"], ["accounts", "บัญชี & โอนเงิน"], ["report", "เดินบัญชี & กระทบแบงค์"]] : [])];
  const [tab, setTab] = React.useState("mine");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">เบิกจ่าย <span className="page-title-en">Expenses</span></h1>
        <p className="page-sub">ขอเบิกค่าใช้จ่าย แนบบิล → อนุมัติ → จ่ายจากกระเป๋าเงิน + แนบหลักฐาน · โอนเงินระหว่างบัญชี</p></div></div>
      <div className="cat-filter">
        {TABS.map(([v, l]) => <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
          style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>)}
      </div>
      {tab === "mine" && <MineTab flash={flash} />}
      {tab === "approve" && office && <ApproveTab flash={flash} />}
      {tab === "accounts" && office && <AccountsTab flash={flash} />}
      {tab === "report" && office && <ReportTab flash={flash} />}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

function ExpenseCard({ x, children }) {
  const st = EST[x.status] || EST.pending;
  return (
    <div className="card job-card">
      <div className="job-card-head" style={{ cursor: "default" }}>
        <div className="job-card-id"><span className="job-no">{x.title}</span><span className={"job-badge " + st.c}>{st.t}</span>{x.job_no && <span className="vat-badge vat-on">งาน {x.job_no}</span>}</div>
        <div className="job-card-meta inv-meta">
          {x.requesterName && <span className="inv-cust">👤 {x.requesterName}</span>}
          {x.category && <span className="inv-period">{x.category}</span>}
          <span className="inv-period">{fmtD(x.created_at)}</span>
          {x.note && <span className="jo-dim">{x.note}</span>}
          {x.decide_note && <span className="jo-dim">หมายเหตุ: {x.decide_note}</span>}
        </div>
        <div className="job-card-cost"><span>ยอดเบิก</span><b>{fmtBaht(x.amount)}</b></div>
      </div>
      {(x.attachments?.length > 0 || x.payment_proof?.length > 0) && (
        <div className="exp-atts">
          {x.attachments?.length > 0 && <div className="exp-att-grp"><span>บิล/หลักฐาน:</span><div className="tb-attach-grid">{x.attachments.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div></div>}
          {x.payment_proof?.length > 0 && <div className="exp-att-grp"><span>หลักฐานการจ่าย:</span><div className="tb-attach-grid">{x.payment_proof.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div></div>}
        </div>
      )}
      {children && <div className="job-lines"><div className="job-actions">{children}</div></div>}
    </div>
  );
}

function MineTab({ flash }) {
  const [list, setList] = React.useState(null);
  const [jobs, setJobs] = React.useState([]);
  const [form, setForm] = React.useState(null);
  async function load() { try { setList(await listMyExpenses()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setList([]); } }
  React.useEffect(() => { load(); listJobOrders().then((j) => setJobs(j.filter((x) => x.status !== "cancelled"))).catch(() => {}); }, []);
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">คำขอเบิกของฉัน</div><div className="sec-sub">เบิกค่าใช้จ่ายทั่วไป หรือเบิกจากใบงาน (ค่าใช้จ่ายงานจะรวมเป็นต้นทุนงาน)</div></div>
        <button className="btn-primary" onClick={() => setForm({ title: "", amount: "", category: "", job_no: "", note: "", attachments: [] })}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> ขอเบิกใหม่</button></div>
      {list === null && <div className="empty">กำลังโหลด…</div>}
      {list && list.length === 0 && <div className="empty">ยังไม่มีคำขอเบิก</div>}
      <div className="job-cards">{(list || []).map((x) => <ExpenseCard key={x.id} x={x} />)}</div>
      {form && <ExpenseForm form={form} setForm={setForm} jobs={jobs} onSaved={() => { setForm(null); load(); }} flash={flash} />}
    </div>
  );
}

function ExpenseForm({ form, setForm, jobs, onSaved, flash }) {
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function save() {
    if (!form.title.trim()) return flash("ใส่ชื่อรายการ", true);
    if (!(Number(form.amount) > 0)) return flash("ใส่จำนวนเงิน", true);
    setBusy(true);
    try { await submitExpense(form); flash("ส่งคำขอเบิกแล้ว รออนุมัติ ✓"); onSaved(); }
    catch (e) { flash("ส่งไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={() => setForm(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <div className="modal-head"><div className="modal-title">ขอเบิกค่าใช้จ่าย</div><button className="modal-x" onClick={() => setForm(null)}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>รายการ/เรื่องที่เบิก</span><input className="inp" value={form.title} autoFocus onChange={(e) => set("title", e.target.value)} placeholder="เช่น ค่าน้ำมัน / ค่าทางด่วน / ซื้อของหน้างาน" /></label>
          <div className="fld-row">
            <label className="fld"><span>จำนวนเงิน (บาท)</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></span></label>
            <label className="fld"><span>หมวดค่าใช้จ่าย</span><CategoryPicker value={form.category} onChange={(v) => set("category", v)} flash={flash} /></label>
          </div>
          <label className="fld"><span>เบิกจากใบงาน (ถ้ามี — จะรวมเป็นต้นทุนงาน)</span>
            <select className="inp" value={form.job_no} onChange={(e) => set("job_no", e.target.value)}>
              <option value="">— ไม่ผูกกับงาน (ค่าใช้จ่ายทั่วไป) —</option>
              {jobs.map((j) => <option key={j.job_no} value={j.job_no}>{j.job_no} · {j.customerName || j.title || "งาน"}</option>)}
            </select></label>
          <label className="fld"><span>รายละเอียดเพิ่มเติม</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="อธิบายรายละเอียดค่าใช้จ่าย (ไม่บังคับ)" /></label>
          <div className="fld"><span>แนบบิล/หลักฐาน</span><AttachRow files={form.attachments} onChange={(a) => set("attachments", a)} flash={flash} /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={() => setForm(null)}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>ส่งขออนุมัติ</button></div>
      </div>
    </div>
  );
}

function ApproveTab({ flash }) {
  const [list, setList] = React.useState(null);
  const [statusF, setStatusF] = React.useState("pending");
  const [payFor, setPayFor] = React.useState(null);
  async function load() { try { setList(await listExpenses()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setList([]); } }
  React.useEffect(() => { load(); }, []);
  async function decide(x, status) {
    const lbl = { approved: "อนุมัติ", rejected: "ไม่อนุมัติ", pending: "ยกเลิกอนุมัติ" }[status];
    if (!await confirmDialog(`${lbl}คำขอเบิก "${x.title}" (${fmtBaht(x.amount)}) ?${status === "pending" ? "\n(รายการจะกลับไปสถานะ “รออนุมัติ”)" : ""}`)) return;
    try { await decideExpense(x.id, status); flash(lbl + "แล้ว"); load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  const shown = (list || []).filter((x) => statusF === "all" || x.status === statusF);
  const cnt = (s) => (list || []).filter((x) => x.status === s).length;
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">อนุมัติ / จ่ายเงินเบิก</div>
        <div className="sec-sub">รออนุมัติ {cnt("pending")} · รอจ่าย {cnt("approved")}</div></div></div>
      <div className="cat-filter">
        {[["pending", "รออนุมัติ"], ["approved", "รอจ่าย"], ["paid", "จ่ายแล้ว"], ["rejected", "ไม่อนุมัติ"], ["all", "ทั้งหมด"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)} style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>
      {list === null && <div className="empty">กำลังโหลด…</div>}
      {list && shown.length === 0 && <div className="empty">ไม่มีรายการ</div>}
      <div className="job-cards">
        {shown.map((x) => (
          <ExpenseCard key={x.id} x={x}>
            {x.status === "pending" && <><button className="btn-primary sm ok" onClick={() => decide(x, "approved")}>✓ อนุมัติ</button>
              <button className="btn-ghost sm" onClick={() => decide(x, "rejected")}>ไม่อนุมัติ</button></>}
            {x.status === "approved" && <><button className="btn-primary sm" onClick={() => setPayFor(x)}><UIcon name="purchase" size={14} color="#fff" /> จ่ายเงิน + แนบหลักฐาน</button>
              <button className="btn-ghost sm danger" onClick={() => decide(x, "pending")}>ยกเลิกอนุมัติ</button></>}
          </ExpenseCard>
        ))}
      </div>
      {payFor && <PayModal x={payFor} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); load(); }} flash={flash} />}
    </div>
  );
}

function PayModal({ x, onClose, onPaid, flash }) {
  const [accounts, setAccounts] = React.useState([]);
  const [accountId, setAccountId] = React.useState("");
  const [proof, setProof] = React.useState([]);
  const [payDate, setPayDate] = React.useState(today());
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { listAccounts().then((a) => { setAccounts(a); setAccountId(a[0]?.id || ""); }).catch(() => {}); }, []);
  async function pay() {
    if (!accountId) return flash("เลือกบัญชีที่จ่าย", true);
    if (!payDate) return flash("เลือกวันที่จ่าย", true);
    setBusy(true);
    try { await payExpense(x.id, { accountId, proof, payDate }); flash("จ่ายเงินแล้ว + แจ้งผู้ขอเบิก ✓"); onPaid(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">จ่ายเงินเบิก · {fmtBaht(x.amount)}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>{x.title}{x.job_no ? ` · งาน ${x.job_no}` : ""} · ผู้ขอเบิก {x.requesterName}</div>
          <div className="fld-row">
            <label className="fld"><span>จ่ายจากบัญชี</span>
              <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} (คงเหลือ {fmtBaht(a.balance)})</option>)}
              </select></label>
            <label className="fld"><span>วันที่จ่าย</span><input type="date" className="inp" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
          </div>
          <div className="fld"><span>แนบหลักฐานการจ่าย (สลิปโอน ฯลฯ)</span><AttachRow files={proof} onChange={setProof} flash={flash} label="แนบสลิป/หลักฐาน" /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={pay}>ยืนยันจ่ายเงิน</button></div>
      </div>
    </div>
  );
}

function AccountsTab({ flash }) {
  const [accounts, setAccounts] = React.useState([]);
  const [t, setT] = React.useState({ fromId: "", toId: "", amount: "", note: "", date: today() });
  const [transfers, setTransfers] = React.useState(null);
  const [edit, setEdit] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const accName = React.useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  async function load() {
    try {
      const [a, tr] = await Promise.all([listAccounts(), listTransfers().catch(() => [])]);
      setAccounts(a); setTransfers(tr); setT((s) => ({ ...s, fromId: s.fromId || a[0]?.id || "", toId: s.toId || a[1]?.id || "" }));
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
  }
  React.useEffect(() => { load(); }, []);
  async function transfer() {
    if (!(Number(t.amount) > 0)) return flash("ใส่จำนวนเงิน", true);
    if (!await confirmDialog(`โอน ${fmtBaht(t.amount)} ระหว่างบัญชี?`)) return;
    setBusy(true);
    try { await transferFunds(t); flash("โอนเงินแล้ว ✓"); setT((s) => ({ ...s, amount: "", note: "" })); load(); }  // keep date for consecutive transfers
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function delTransfer(tr) {
    if (!await confirmDialog(`ลบรายการโอน ${fmtBaht(tr.amount)} (${accName[tr.fromId] || "?"} → ${accName[tr.toId] || "?"}) ?`)) return;
    try { await deleteTransfer(tr.ref_id); flash("ลบรายการโอนแล้ว"); load(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }
  return (
    <>
      <div className="exp-accounts">
        {accounts.map((a) => (
          <div className="exp-acc" key={a.id}>
            <div className="exp-acc-name">{a.kind === "cash" ? "💵" : "🏦"} {a.name}</div>
            <div className="exp-acc-bal">{fmtBaht(a.balance)}</div>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="sec-head"><div><div className="sec-title">โอนเงินระหว่างบัญชี</div></div></div>
        <div className="fld-row">
          <label className="fld"><span>จากบัญชี</span><select className="inp" value={t.fromId} onChange={(e) => setT({ ...t, fromId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="fld"><span>ไปบัญชี</span><select className="inp" value={t.toId} onChange={(e) => setT({ ...t, toId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        </div>
        <div className="fld-row">
          <label className="fld"><span>วันที่โอน</span><input type="date" className="inp" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} /></label>
          <label className="fld"><span>จำนวนเงิน</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={t.amount} onChange={(e) => setT({ ...t, amount: e.target.value })} /></span></label>
        </div>
        <label className="fld"><span>หมายเหตุ</span><input className="inp" value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} placeholder="(ไม่บังคับ)" /></label>
        <button className="btn-primary" disabled={busy} onClick={transfer}><UIcon name="trend" size={15} color="#fff" /> โอนเงิน</button>
      </div>

      <div className="card">
        <div className="sec-head"><div><div className="sec-title">ประวัติการโอน</div><div className="sec-sub">แก้ไข/ลบได้ เผื่อบันทึกผิด (มีผลกับยอดทั้ง 2 บัญชีทันที)</div></div></div>
        {transfers === null && <div className="empty sm">กำลังโหลด…</div>}
        {transfers && transfers.length === 0 && <div className="empty sm">ยังไม่มีรายการโอน</div>}
        {transfers && transfers.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="hr-table">
              <thead><tr><th style={{ textAlign: "left" }}>วันที่</th><th style={{ textAlign: "left" }}>จาก → ไป</th><th style={{ textAlign: "left" }}>หมายเหตุ</th><th>จำนวน</th><th style={{ width: 90 }}></th></tr></thead>
              <tbody>
                {transfers.map((tr) => (
                  <tr key={tr.ref_id}>
                    <td style={{ textAlign: "left" }}>{fmtD(tr.entry_date)}</td>
                    <td style={{ textAlign: "left" }}>{accName[tr.fromId] || "?"} <span style={{ color: "var(--ink-3)" }}>→</span> {accName[tr.toId] || "?"}</td>
                    <td style={{ textAlign: "left", color: "var(--ink-3)" }}>{tr.note || "-"}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtBaht(tr.amount)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn-ghost sm" title="แก้ไข" onClick={() => setEdit({ ...tr, amount: String(tr.amount) })} style={{ padding: "2px 7px" }}><UIcon name="edit" size={13} /></button>
                      <button className="btn-ghost sm" title="ลบ" onClick={() => delTransfer(tr)} style={{ padding: "2px 7px", marginLeft: 4 }}><UIcon name="x" size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && <TransferEditModal tr={edit} accounts={accounts} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} flash={flash} />}
    </>
  );
}

function TransferEditModal({ tr, accounts, onClose, onSaved, flash }) {
  const [f, setF] = React.useState({ fromId: tr.fromId, toId: tr.toId, amount: tr.amount, note: tr.note || "", entry_date: tr.entry_date || today() });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (f.fromId === f.toId) return flash("บัญชีต้นทาง/ปลายทางต้องต่างกัน", true);
    if (!(Number(f.amount) > 0)) return flash("ใส่จำนวนเงิน", true);
    setBusy(true);
    try { await updateTransfer(tr.ref_id, f); flash("แก้ไขรายการโอนแล้ว ✓"); onSaved(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-head"><div className="modal-title">แก้ไขรายการโอน</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>จากบัญชี</span><select className="inp" value={f.fromId} onChange={(e) => set("fromId", e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="fld"><span>ไปบัญชี</span><select className="inp" value={f.toId} onChange={(e) => set("toId", e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>วันที่</span><input type="date" className="inp" value={f.entry_date} onChange={(e) => set("entry_date", e.target.value)} /></label>
            <label className="fld"><span>จำนวนเงิน</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></span></label>
          </div>
          <label className="fld"><span>หมายเหตุ</span><input className="inp" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="(ไม่บังคับ)" /></label>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>บันทึกการแก้ไข</button></div>
      </div>
    </div>
  );
}

const KIND_TAG = { transfer: "🔁 โอน", expense: "🧾 เบิกจ่าย", receipt: "💰 รับเงินลูกค้า", payout: "🧑‍🔧 จ่ายช่างซัพ", opening: "⚑ ยอดยกมา", adjust: "⚙ ปรับปรุง", manual: "✍️ บันทึกเอง" };
const recErr = (e) => /reconciled|column|PGRST204/i.test(e?.message || "") ? "ยังไม่ได้รัน migration 089 (กระทบแบงค์) ใน Supabase ก่อน" : "ไม่สำเร็จ: " + (e?.message || e);
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const thMonth = (d) => d.toLocaleDateString("th-TH", { month: "long", year: "numeric" });

function ReportTab({ flash }) {
  const [accounts, setAccounts] = React.useState([]);
  const [accountId, setAccountId] = React.useState("");     // set to first bank account after load
  const [rows, setRows] = React.useState(null);
  const [onlyUnrec, setOnlyUnrec] = React.useState(false);
  const [stmt, setStmt] = React.useState("");
  const [addOpen, setAddOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [anchor, setAnchor] = React.useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [allMonths, setAllMonths] = React.useState(false);
  const [openingInput, setOpeningInput] = React.useState("");
  const [openingLocked, setOpeningLocked] = React.useState(true); // ยอดตั้งต้นล็อกไว้ กันแก้พลาด
  const accById = React.useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);

  async function loadAccounts() {
    try { const a = await listAccounts(); setAccounts(a); if (!accountId) setAccountId((a.find((x) => x.kind === "bank") || a[0])?.id || "all"); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
  }
  async function loadRows() {
    if (!accountId) return;
    try { setRows(await listAccountEntries(accountId !== "all" ? { accountId } : {})); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setRows([]); }
  }
  // on open: pull customer deposits from receipts, then load (so รับเงินลูกค้า appears without pressing sync)
  React.useEffect(() => { (async () => { try { await syncBankReceipts(); } catch (_) {} loadAccounts(); })(); }, []);
  React.useEffect(() => { loadRows(); }, [accountId]);
  const acc0 = accById[accountId];
  React.useEffect(() => { if (accountId && accountId !== "all") { setOpeningInput(String(Number(acc0?.opening_balance) || 0)); setOpeningLocked(true); } }, [accountId, acc0?.opening_balance]);
  const refresh = () => { loadAccounts(); loadRows(); };
  async function pullReceipts() {
    setBusy(true);
    try { const r = await syncBankReceipts(); flash(`ดึงจากใบเสร็จแล้ว · เพิ่ม ${r.added} · อัปเดต ${r.updated}${r.removed ? " · ลบ " + r.removed : ""} ✓`); refresh(); }
    catch (e) { flash(recErr(e), true); }
    setBusy(false);
  }
  const move = (n) => { setAllMonths(false); setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + n, 1)); };

  const single = !!accountId && accountId !== "all";
  const acc = single ? accById[accountId] : null;
  const list = rows || [];
  const sign = (r) => (r.direction === "in" ? 1 : -1) * (Number(r.amount) || 0);
  const base = single ? Number(acc?.opening_balance) || 0 : 0;
  const monthly = single && !allMonths;                       // running month view (opening → closing)
  const monthStart = ymd(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const nextStart = ymd(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1));
  // ยอดยกมาต้นเดือน = ยอดตั้งต้น + ทุกรายการก่อนเดือนนี้ (ยอดคงเหลือสิ้นเดือนก่อนไหลมาเป็นยอดยกมาอัตโนมัติ)
  const monthOpening = base + (monthly ? list.filter((r) => r.entry_date < monthStart).reduce((a, r) => a + sign(r), 0) : 0);
  const inScope = monthly ? list.filter((r) => r.entry_date >= monthStart && r.entry_date < nextStart) : list;
  const scopeIn = inScope.filter((r) => r.direction === "in").reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const scopeOut = inScope.filter((r) => r.direction === "out").reduce((a, r) => a + (Number(r.amount) || 0), 0);
  const closing = monthOpening + scopeIn - scopeOut;          // ยอดคงเหลือสิ้นเดือน = ยอดยกมาเดือนถัดไป
  const recCount = inScope.filter((r) => r.reconciled).length;
  const stmtNum = stmt.trim() === "" ? null : Number(stmt);
  const diff = stmtNum == null || !single ? null : Math.round((stmtNum - closing) * 100) / 100;
  const shown = inScope.filter((r) => !onlyUnrec || !r.reconciled);

  // running balance per account (passbook style) — seed = ยอดยกมา (opening + รายการก่อน scope), ไล่ตามวัน
  const runBal = {};
  (() => {
    const seed = {}; accounts.forEach((a) => { seed[a.id] = Number(a.opening_balance) || 0; });
    if (monthly) list.forEach((r) => { if (r.entry_date < monthStart) seed[r.account_id] = (seed[r.account_id] || 0) + sign(r); });
    [...inScope].sort((a, b) => (a.entry_date || "").localeCompare(b.entry_date || "") || String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .forEach((r) => { seed[r.account_id] = Math.round(((seed[r.account_id] || 0) + sign(r)) * 100) / 100; runBal[r.id] = seed[r.account_id]; });
  })();

  async function unlockOpening() {
    if (!await confirmDialog("ปลดล็อกเพื่อแก้ 'ยอดยกมาตั้งต้น' ?\nยอดนี้กระทบยอดคงเหลือทุกเดือน แก้เมื่อจำเป็นเท่านั้น")) return;
    setOpeningLocked(false);
  }
  async function saveOpening() {
    if (!single) { setOpeningLocked(true); return; }
    const v = Number(openingInput) || 0;
    if (v === (Number(acc?.opening_balance) || 0)) { setOpeningLocked(true); return; }
    try { await setAccountOpening(accountId, v); flash("บันทึกยอดยกมาแล้ว ✓"); loadAccounts(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setOpeningLocked(true);
  }
  async function toggleRec(r) {
    setBusy(true);
    try { await setEntriesReconciled([r.id], !r.reconciled); setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, reconciled: !r.reconciled } : x)); }
    catch (e) { flash(recErr(e), true); }
    setBusy(false);
  }
  async function reconcileAllShown() {
    const ids = shown.filter((r) => !r.reconciled).map((r) => r.id);
    if (!ids.length) return flash("ไม่มีรายการที่ยังไม่กระทบในหน้านี้");
    if (!await confirmDialog(`ทำเครื่องหมาย "กระทบแล้ว" ให้ ${ids.length} รายการที่แสดง?`)) return;
    setBusy(true);
    try { await setEntriesReconciled(ids, true); setRows((rs) => rs.map((x) => ids.includes(x.id) ? { ...x, reconciled: true } : x)); flash(`กระทบ ${ids.length} รายการแล้ว ✓`); }
    catch (e) { flash(recErr(e), true); }
    setBusy(false);
  }
  async function del(r) {
    if (!await confirmDialog(`ลบรายการ "${r.note || "-"}" (${fmtBaht(r.amount)}) ?`)) return;
    try { await deleteAccountEntry(r.id); flash("ลบแล้ว"); refresh(); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }

  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">เดินบัญชี & กระทบแบงค์</div>
        <div className="sec-sub">ดึงยอดรับเงินจากใบเสร็จอัตโนมัติ · ดูแยกรายเดือน (ยอดยกมา→คงเหลือ ยกไปเดือนถัดไปอัตโนมัติ) · ติ๊ก ✓ ที่ตรงกับ statement</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost" disabled={busy} onClick={pullReceipts}><UIcon name="withdraw" size={15} /> ดึงยอดรับเงินจากเอกสาร</button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่มรายการ (ฝาก/ถอน)</button>
        </div></div>

      <div className="cat-filter" style={{ marginTop: 4 }}>
        {[["all", "ทุกบัญชี"], ...accounts.map((a) => [a.id, (a.kind === "cash" ? "💵 " : "🏦 ") + a.name])].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (accountId === v ? " on" : "")} onClick={() => setAccountId(v)} style={accountId === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>

      {single && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px 0 2px" }}>
            <button className="btn-ghost sm" disabled={allMonths} onClick={() => move(-1)}>◀</button>
            <b style={{ minWidth: 150, textAlign: "center", fontSize: 15 }}>{allMonths ? "ทุกเดือน" : thMonth(anchor)}</b>
            <button className="btn-ghost sm" disabled={allMonths} onClick={() => move(1)}>▶</button>
            <button className="btn-ghost sm" onClick={() => { setAllMonths(false); const d = new Date(); setAnchor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>เดือนนี้</button>
            <button className={"cat-chip" + (allMonths ? " on" : "")} onClick={() => setAllMonths((v) => !v)} style={allMonths ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทุกเดือน</button>
            <label className="jo-dim" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>ยอดยกมาตั้งต้น
              <span className="inp inp-unit" style={{ width: 150, opacity: openingLocked ? 0.65 : 1 }}><span className="unit-pre">฿</span>
                <input type="number" step="0.01" value={openingInput} disabled={openingLocked} onChange={(e) => setOpeningInput(e.target.value)} onBlur={saveOpening} title="ยอดก่อนรายการแรกสุด — เดือนถัด ๆ ไประบบยกยอดให้เอง" /></span>
              {openingLocked
                ? <button className="btn-ghost sm" onClick={unlockOpening} title="ปลดล็อกเพื่อแก้ยอดตั้งต้น">🔒 แก้</button>
                : <button className="btn-ghost sm ok" onClick={saveOpening} title="บันทึก + ล็อก">✓ บันทึก</button>}
            </label>
          </div>
          <div className="exp-accounts" style={{ marginTop: 8 }}>
            <div className="exp-acc"><div className="exp-acc-name">{monthly ? "ยอดยกมาต้นเดือน" : "ยอดยกมาตั้งต้น"}</div><div className="exp-acc-bal">{fmtBaht(monthOpening)}</div></div>
            <div className="exp-acc"><div className="exp-acc-name">เงินเข้า{monthly ? "เดือนนี้" : "ทั้งหมด"}</div><div className="exp-acc-bal" style={{ color: "var(--up)" }}>{fmtBaht(scopeIn)}</div></div>
            <div className="exp-acc"><div className="exp-acc-name">เงินออก{monthly ? "เดือนนี้" : "ทั้งหมด"}</div><div className="exp-acc-bal" style={{ color: "var(--down)" }}>−{fmtBaht(scopeOut)}</div></div>
            <div className="exp-acc"><div className="exp-acc-name">{monthly ? "ยอดคงเหลือสิ้นเดือน" : "ยอดคงเหลือ"}</div><div className="exp-acc-bal">{fmtBaht(closing)}</div>{monthly && <div className="jo-dim" style={{ marginTop: 2 }}>ยกไปเดือนหน้าอัตโนมัติ</div>}</div>
            <div className="exp-acc">
              <div className="exp-acc-name">ยอดตาม statement {monthly ? "(สิ้นเดือน)" : "ธนาคาร"}</div>
              <span className="inp inp-unit" style={{ marginTop: 6 }}><span className="unit-pre">฿</span><input type="number" step="0.01" value={stmt} onChange={(e) => setStmt(e.target.value)} placeholder="กรอกยอดจากธนาคาร" /></span>
              {diff != null && <div className="jo-dim" style={{ marginTop: 6, fontWeight: 700, color: diff === 0 ? "var(--up)" : "var(--down)" }}>{diff === 0 ? "✓ ตรงกับยอดในระบบ" : `ผลต่าง ${fmtBaht(diff)}`}</div>}
            </div>
          </div>
        </>
      )}

      <div className="cat-filter" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <label className="jo-dim" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyUnrec} onChange={(e) => setOnlyUnrec(e.target.checked)} /> แสดงเฉพาะที่ยังไม่กระทบ
          {single && <span style={{ marginLeft: 8 }}>· กระทบแล้ว {recCount}/{inScope.length}</span>}
        </label>
        <button className="btn-ghost sm" disabled={busy || !shown.some((r) => !r.reconciled)} onClick={reconcileAllShown}>✓ กระทบทั้งหมดที่แสดง</button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="hr-table">
          <thead><tr><th style={{ width: 44 }}>กระทบ</th><th style={{ textAlign: "left" }}>วันที่</th>{!single && <th style={{ textAlign: "left" }}>บัญชี</th>}<th style={{ textAlign: "left" }}>รายการ</th><th>เข้า</th><th>ออก</th><th>คงเหลือ</th><th style={{ width: 44 }}></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={single ? 7 : 8} className="empty sm">กำลังโหลด…</td></tr>}
            {rows && shown.length === 0 && <tr><td colSpan={single ? 7 : 8} className="empty sm">{monthly ? "ไม่มีรายการในเดือนนี้" : "ไม่มีรายการ"}</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} style={r.reconciled ? { background: "var(--surface-2)" } : {}}>
                <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!r.reconciled} disabled={busy} onChange={() => toggleRec(r)} title="กระทบกับ statement แล้ว" /></td>
                <td style={{ textAlign: "left" }}>{fmtD(r.entry_date)}</td>
                {!single && <td style={{ textAlign: "left" }}>{accById[r.account_id]?.name || "-"}</td>}
                <td style={{ textAlign: "left" }}>{r.note || "-"}{r.category && <span className="jo-dim" style={{ marginLeft: 6, background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "1px 6px" }}>{r.category}</span>}<span className="jo-dim" style={{ marginLeft: 6 }}>{KIND_TAG[r.kind] || ""}</span></td>
                <td className="hr-ok">{r.direction === "in" ? fmtBaht(r.amount) : "—"}</td>
                <td className="hr-bad">{r.direction === "out" ? fmtBaht(r.amount) : "—"}</td>
                <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{runBal[r.id] != null ? fmtBaht(runBal[r.id]) : "—"}</td>
                <td style={{ textAlign: "center" }}>{r.kind === "manual" && <button className="btn-ghost sm" title="ลบ" onClick={() => del(r)} style={{ padding: "2px 6px" }}><UIcon name="x" size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="page-sub" style={{ marginTop: 10 }}>* ยอดยกมาต้นเดือน = ยอดตั้งต้น + ทุกรายการก่อนเดือนนั้น · ยอดคงเหลือสิ้นเดือนจะไหลไปเป็นยอดยกมาเดือนถัดไปอัตโนมัติ · statement เทียบกับยอดคงเหลือระบบ (ควรต่าง ฿0) · รายการที่ระบบสร้างเอง (เบิกจ่าย/โอน/รับเงิน) ลบไม่ได้</p>

      {addOpen && <AddEntryModal accounts={accounts} defaultAccountId={single ? accountId : ""} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refresh(); }} flash={flash} />}
    </div>
  );
}

function AddEntryModal({ accounts, defaultAccountId, onClose, onSaved, flash }) {
  const [f, setF] = React.useState({ accountId: defaultAccountId || accounts[0]?.id || "", direction: "in", amount: "", note: "", category: "", entry_date: today() });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.accountId) return flash("เลือกบัญชี", true);
    if (!(Number(f.amount) > 0)) return flash("ใส่จำนวนเงิน", true);
    setBusy(true);
    try { await addAccountEntry(f); flash("บันทึกรายการเดินบัญชีแล้ว ✓"); onSaved(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">เพิ่มรายการเดินบัญชี</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>บัญชี</span>
            <select className="inp" value={f.accountId} onChange={(e) => set("accountId", e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{(a.kind === "cash" ? "💵 " : "🏦 ") + a.name}</option>)}
            </select></label>
          <label className="fld"><span>ประเภท</span>
            <div className="cat-filter" style={{ margin: 0 }}>
              {[["in", "💰 เงินเข้า / ฝาก"], ["out", "💸 เงินออก / ถอน-ค่าธรรมเนียม"]].map(([v, l]) => (
                <button type="button" key={v} className={"cat-chip" + (f.direction === v ? " on" : "")} onClick={() => set("direction", v)} style={f.direction === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
              ))}
            </div></label>
          <div className="fld-row">
            <label className="fld"><span>วันที่</span><input type="date" className="inp" value={f.entry_date} onChange={(e) => set("entry_date", e.target.value)} /></label>
            <label className="fld"><span>จำนวนเงิน</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={f.amount} autoFocus onChange={(e) => set("amount", e.target.value)} /></span></label>
          </div>
          <label className="fld"><span>หมวดค่าใช้จ่าย</span><CategoryPicker value={f.category} onChange={(v) => set("category", v)} flash={flash} /></label>
          <label className="fld"><span>รายการ / รายละเอียดเพิ่มเติม</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="เช่น รับเงินลูกค้า / ดอกเบี้ย / ค่าธรรมเนียมธนาคาร" /></label>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>บันทึก</button></div>
      </div>
    </div>
  );
}
