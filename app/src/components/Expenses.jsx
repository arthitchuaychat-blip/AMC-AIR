import React from "react";
import { listAccounts, listAccountEntries, transferFunds, uploadExpenseFile, submitExpense, listMyExpenses, listExpenses, decideExpense, payExpense, listJobOrders } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import AttachThumb from "./AttachThumb";
import { fmtBaht, ATTACH_ACCEPT } from "../lib/format";
import { UIcon } from "../icons";

const OFFICE = ["admin", "exec", "finance"];
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

export default function Expenses({ role, me }) {
  const office = OFFICE.includes(role);
  const TABS = [["mine", "ขอเบิกของฉัน"], ...(office ? [["approve", "อนุมัติ / จ่าย"], ["accounts", "บัญชี & โอนเงิน"], ["report", "รายงานบัญชี"]] : [])];
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
            <label className="fld"><span>หมวด (ไม่บังคับ)</span><input className="inp" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="เช่น เดินทาง / วัสดุ / รับรอง" /></label>
          </div>
          <label className="fld"><span>เบิกจากใบงาน (ถ้ามี — จะรวมเป็นต้นทุนงาน)</span>
            <select className="inp" value={form.job_no} onChange={(e) => set("job_no", e.target.value)}>
              <option value="">— ไม่ผูกกับงาน (ค่าใช้จ่ายทั่วไป) —</option>
              {jobs.map((j) => <option key={j.job_no} value={j.job_no}>{j.job_no} · {j.customerName || j.title || "งาน"}</option>)}
            </select></label>
          <label className="fld"><span>หมายเหตุ</span><input className="inp" value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="(ไม่บังคับ)" /></label>
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
    const lbl = { approved: "อนุมัติ", rejected: "ไม่อนุมัติ" }[status];
    if (!await confirmDialog(`${lbl}คำขอเบิก "${x.title}" (${fmtBaht(x.amount)}) ?`)) return;
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
            {x.status === "approved" && <button className="btn-primary sm" onClick={() => setPayFor(x)}><UIcon name="purchase" size={14} color="#fff" /> จ่ายเงิน + แนบหลักฐาน</button>}
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
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { listAccounts().then((a) => { setAccounts(a); setAccountId(a[0]?.id || ""); }).catch(() => {}); }, []);
  async function pay() {
    if (!accountId) return flash("เลือกบัญชีที่จ่าย", true);
    setBusy(true);
    try { await payExpense(x.id, { accountId, proof, payDate: today() }); flash("จ่ายเงินแล้ว + แจ้งผู้ขอเบิก ✓"); onPaid(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">จ่ายเงินเบิก · {fmtBaht(x.amount)}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>{x.title}{x.job_no ? ` · งาน ${x.job_no}` : ""} · ผู้ขอเบิก {x.requesterName}</div>
          <label className="fld"><span>จ่ายจากบัญชี</span>
            <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} (คงเหลือ {fmtBaht(a.balance)})</option>)}
            </select></label>
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
  const [t, setT] = React.useState({ fromId: "", toId: "", amount: "", note: "" });
  const [busy, setBusy] = React.useState(false);
  async function load() { try { const a = await listAccounts(); setAccounts(a); setT((s) => ({ ...s, fromId: s.fromId || a[0]?.id || "", toId: s.toId || a[1]?.id || "" })); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); } }
  React.useEffect(() => { load(); }, []);
  async function transfer() {
    if (!(Number(t.amount) > 0)) return flash("ใส่จำนวนเงิน", true);
    if (!await confirmDialog(`โอน ${fmtBaht(t.amount)} ระหว่างบัญชี?`)) return;
    setBusy(true);
    try { await transferFunds(t); flash("โอนเงินแล้ว ✓"); setT((s) => ({ ...s, amount: "", note: "" })); load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
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
          <label className="fld"><span>จำนวนเงิน</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={t.amount} onChange={(e) => setT({ ...t, amount: e.target.value })} /></span></label>
          <label className="fld"><span>หมายเหตุ</span><input className="inp" value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} placeholder="(ไม่บังคับ)" /></label>
        </div>
        <button className="btn-primary" disabled={busy} onClick={transfer}><UIcon name="trend" size={15} color="#fff" /> โอนเงิน</button>
      </div>
    </>
  );
}

function ReportTab({ flash }) {
  const [accounts, setAccounts] = React.useState([]);
  const [accountId, setAccountId] = React.useState("all");
  const [rows, setRows] = React.useState([]);
  const accName = React.useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a.name])), [accounts]);
  async function load() {
    try { const [a, e] = await Promise.all([listAccounts(), listAccountEntries(accountId === "all" ? {} : { accountId })]); setAccounts(a); setRows(e); }
    catch (err) { flash("โหลดไม่สำเร็จ: " + (err.message || err), true); }
  }
  React.useEffect(() => { load(); }, [accountId]);
  const totIn = rows.filter((r) => r.direction === "in").reduce((a, r) => a + Number(r.amount || 0), 0);
  const totOut = rows.filter((r) => r.direction === "out").reduce((a, r) => a + Number(r.amount || 0), 0);
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">รายงานเงินเข้า–ออก</div><div className="sec-sub">เงินเข้า {fmtBaht(totIn)} · เงินออก {fmtBaht(totOut)} · สุทธิ {fmtBaht(totIn - totOut)}</div></div>
        <select className="inp" style={{ width: "auto" }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="all">ทุกบัญชี</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></div>
      <div style={{ overflowX: "auto" }}>
        <table className="hr-table">
          <thead><tr><th style={{ textAlign: "left" }}>วันที่</th><th style={{ textAlign: "left" }}>บัญชี</th><th style={{ textAlign: "left" }}>รายการ</th><th>เข้า</th><th>ออก</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="empty sm">ไม่มีรายการ</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ textAlign: "left" }}>{fmtD(r.entry_date)}</td>
                <td style={{ textAlign: "left" }}>{accName[r.account_id] || "-"}</td>
                <td style={{ textAlign: "left" }}>{r.kind === "transfer" ? "🔁 " : ""}{r.note || "-"}</td>
                <td className="hr-ok">{r.direction === "in" ? fmtBaht(r.amount) : "—"}</td>
                <td className="hr-bad">{r.direction === "out" ? fmtBaht(r.amount) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
