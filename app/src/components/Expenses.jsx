import React from "react";
import { listAccounts, listAccountEntries, transferFunds, listTransfers, updateTransfer, deleteTransfer, addAccountEntry, deleteAccountEntry, setEntriesReconciled, setAccountOpening, syncBankReceipts, listExpenseCategories, addExpenseCategory, uploadExpenseFile, submitExpense, listMyExpenses, listExpenses, decideExpense, payExpense, attachExpenseReceipt, setExpenseExpectedDate, listJobOrders, listPurchaseOrders, requestPoPaymentBatch } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { useDocPeek } from "./DocPeek";
import AttachThumb from "./AttachThumb";
import { fmtBaht, ATTACH_ACCEPT, matchText } from "../lib/format";
import DateRangeBar, { inDateRange } from "./DateRangeBar";
import { UIcon } from "../icons";

const OFFICE = ["admin", "exec", "finance", "hr"]; // hr: อนุมัติ/จ่ายเบิก + คุมเงินสดย่อย (v249)
const EST = { pending: { t: "รออนุมัติ", c: "b-amber" }, approved: { t: "อนุมัติ · รอจ่าย", c: "b-blue" }, rejected: { t: "ไม่อนุมัติ", c: "b-red" }, paid: { t: "จ่ายแล้ว", c: "b-green" } };
// เบิกเงินไปแล้ว (จ่ายครบหรือบางส่วน) แต่ยังไม่มีรูปใบเสร็จ/บิลแนบ → ตามทวงใบเสร็จ
const needReceipt = (x) => x.status !== "rejected" && (x.status === "paid" || Number(x.paid_amount) > 0) && !(x.attachments?.length);
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

export default function Expenses({ role, me, onOpenDoc }) {
  const office = OFFICE.includes(role);
  const TABS = [["mine", "ขอเบิกของฉัน"], ...(office ? [["approve", "อนุมัติ / จ่าย"], ["accounts", "บัญชี & โอนเงิน"], ["report", "เดินบัญชี & กระทบแบงค์"]] : [])];
  const [tab, setTab] = React.useState("mine");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  const [peekEl, openPeek] = useDocPeek(onOpenDoc);   // ชิปเอกสาร (PO/งาน/QT) → พรีวิวแผงขวาก่อน · เปิดหน้าเต็มค่อยเด้งไปเมนู
  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">เบิกจ่าย <span className="page-title-en">Expenses</span></h1>
        <p className="page-sub">ขอเบิก (ใบเสร็จยังไม่มีได้) → อนุมัติ → โอนจ่าย + แนบสลิป → เอาเงินไปจ่ายแล้วกลับมาแนบใบเสร็จ · โอนเงินระหว่างบัญชี</p></div></div>
      <div className="cat-filter">
        {TABS.map(([v, l]) => <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
          style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>)}
      </div>
      {tab === "mine" && <MineTab flash={flash} onOpenDoc={openPeek} />}
      {tab === "approve" && office && <ApproveTab flash={flash} onOpenDoc={openPeek} />}
      {tab === "accounts" && office && <AccountsTab flash={flash} />}
      {tab === "report" && office && <ReportTab flash={flash} />}
      {peekEl}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

function ExpenseCard({ x, children, onOpenDoc, onSetExpected }) {
  const st = EST[x.status] || EST.pending;
  const paid = Math.round((Number(x.paid_amount) || 0) * 100) / 100;
  const total = Math.round((Number(x.amount) || 0) * 100) / 100;
  const partial = x.status !== "paid" && paid > 0 && paid < total;   // จ่ายแล้วบางส่วน
  const chip = (label, on, color) => <button type="button" className="vat-badge" title="เปิดเอกสารที่เกี่ยวข้อง"
    style={{ cursor: onOpenDoc ? "pointer" : "default", border: "1px solid transparent", background: color.bg, color: color.fg }}
    onClick={() => onOpenDoc && on()}>{label} ↗</button>;
  return (
    <div className="card job-card">
      <div className="job-card-head" style={{ cursor: "default" }}>
        <div className="job-card-id"><span className="job-no">{x.title}</span><span className={"job-badge " + st.c}>{st.t}</span>
          {partial && <span className="job-badge b-amber">จ่ายบางส่วน</span>}
          {needReceipt(x) && <span className="job-badge b-amber">📎 ค้างแนบใบเสร็จ</span>}
          {(x.poNos?.length ? x.poNos : x.poNo ? [x.poNo] : []).map((n) => (
            <React.Fragment key={n}>{chip("PO " + n, () => onOpenDoc("po", n), { bg: "#fff7ed", fg: "#c2410c" })}</React.Fragment>
          ))}
          {(x.jobNo || x.job_no) && chip("งาน " + (x.jobNo || x.job_no), () => onOpenDoc("job", x.jobNo || x.job_no), { bg: "#f3e8ff", fg: "#7c3aed" })}
          {x.quoteNo && chip("อ้างอิง " + x.quoteNo, () => onOpenDoc("quote", x.quoteNo), { bg: "#eff6ff", fg: "#1d4ed8" })}
        </div>
        <div className="job-card-meta inv-meta">
          {x.customerName && <span className="inv-cust">👤 ลูกค้า {x.customerName}</span>}
          {x.jobTitle && <span className="inv-period">📋 {x.jobTitle}</span>}
          {x.requesterName && <span className="inv-period">ผู้ขอเบิก {x.requesterName}</span>}
          {x.category && <span className="inv-period">{x.category}</span>}
          <span className="inv-period">{fmtD(x.created_at)}</span>
          {x.note && <span className="jo-dim">{x.note}</span>}
          {x.decide_note && <span className="jo-dim">หมายเหตุ: {x.decide_note}</span>}
        </div>
        <div className="job-card-cost"><span>ยอดเบิก</span><b>{fmtBaht(x.amount)}</b>
          {partial && <small style={{ color: "#d97706", fontWeight: 700 }}>จ่ายแล้ว {fmtBaht(paid)} · เหลือ {fmtBaht(total - paid)}</small>}
        </div>
      </div>
      {partial && onSetExpected && (
        <div className="job-lines"><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)", padding: "2px 0" }}>
          📅 ยอดค้าง {fmtBaht(total - paid)} ตั้งประมาณการจ่ายในกระแสเงินสดวันที่:
          <input type="date" className="inp" style={{ width: 160, padding: "4px 8px" }} value={x.expected_pay_date || ""} onChange={(e) => onSetExpected(x.id, e.target.value)} />
        </div></div>
      )}
      {(x.attachments?.length > 0 || x.payment_proof?.length > 0) && (
        <div className="exp-atts">
          {x.attachments?.length > 0 && <div className="exp-att-grp"><span>🧾 ใบเสร็จ/บิล:</span><div className="tb-attach-grid">{x.attachments.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div></div>}
          {x.payment_proof?.length > 0 && <div className="exp-att-grp"><span>💸 สลิปโอนเงิน:</span><div className="tb-attach-grid">{x.payment_proof.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div></div>}
        </div>
      )}
      {children && <div className="job-lines"><div className="job-actions">{children}</div></div>}
    </div>
  );
}

// ค้นหาใบเบิก: ชื่อรายการ / เลข PO / ลูกค้า / พนักงานผู้ขอ / งาน / QT / หมวด + ช่วงวันที่สร้าง
const expMatch = (x, q, dateR) =>
  matchText(q, x.title, x.poNo, ...(x.poNos || []), x.customerName, x.requesterName, x.jobNo || x.job_no, x.quoteNo, x.category, x.jobTitle, x.note)
  && inDateRange(x.created_at, dateR);

function MineTab({ flash, onOpenDoc }) {
  const [list, setList] = React.useState(null);
  const [jobs, setJobs] = React.useState([]);
  const [form, setForm] = React.useState(null);
  const [rcptFor, setRcptFor] = React.useState(null);   // รายการที่กำลังแนบใบเสร็จย้อนหลัง
  const [q, setQ] = React.useState("");
  const [dateR, setDateR] = React.useState({ from: "", to: "" });
  async function load() { try { setList(await listMyExpenses()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setList([]); } }
  React.useEffect(() => { load(); listJobOrders().then((j) => setJobs(j.filter((x) => x.status !== "cancelled"))).catch(() => {}); }, []);
  const pendRcpt = (list || []).filter(needReceipt).length;
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">คำขอเบิกของฉัน</div><div className="sec-sub">เบิกค่าใช้จ่ายทั่วไป หรือเบิกจากใบงาน (ค่าใช้จ่ายงานจะรวมเป็นต้นทุนงาน)
        {pendRcpt > 0 && <b style={{ color: "#d97706" }}> · 📎 ค้างแนบใบเสร็จ {pendRcpt} รายการ</b>}</div></div>
        <button className="btn-primary" onClick={() => setForm({ title: "", amount: "", category: "", job_no: "", note: "", attachments: [] })}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> ขอเบิกใหม่</button></div>
      <div className="cat-filter" style={{ marginBottom: 10, alignItems: "center" }}>
        <div className="cat-search" style={{ flex: "1 1 220px" }}><UIcon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ลูกค้า / เลข PO / ชื่อรายการ…" /></div>
        <DateRangeBar value={dateR} onChange={setDateR} />
      </div>
      {list === null && <div className="empty">กำลังโหลด…</div>}
      {list && list.length === 0 && <div className="empty">ยังไม่มีคำขอเบิก</div>}
      {list && list.length > 0 && (list || []).filter((x) => expMatch(x, q, dateR)).length === 0 && <div className="empty">ไม่พบรายการตามที่ค้นหา</div>}
      <div className="job-cards">{(list || []).filter((x) => expMatch(x, q, dateR)).map((x) => (
        <ExpenseCard key={x.id} x={x} onOpenDoc={onOpenDoc}>
          {x.status !== "rejected" && (
            needReceipt(x)
              ? <button className="btn-primary sm" onClick={() => setRcptFor(x)}>📎 แนบใบเสร็จ</button>
              : (x.status === "paid" || Number(x.paid_amount) > 0) && <button className="btn-ghost sm" onClick={() => setRcptFor(x)}>📎 แนบใบเสร็จเพิ่ม</button>
          )}
        </ExpenseCard>
      ))}</div>
      {form && <ExpenseForm form={form} setForm={setForm} jobs={jobs} onSaved={() => { setForm(null); load(); }} flash={flash} />}
      {rcptFor && <ReceiptModal x={rcptFor} onClose={() => setRcptFor(null)} onSaved={() => { setRcptFor(null); load(); }} flash={flash} />}
    </div>
  );
}

// แนบใบเสร็จ/บิลย้อนหลัง — เบิกเงินไปจ่ายก่อน ใบเสร็จตามมาทีหลัง (มิเกรชัน 133)
function ReceiptModal({ x, onClose, onSaved, flash }) {
  const [files, setFiles] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!files.length) return flash("แนบรูปใบเสร็จก่อน", true);
    setBusy(true);
    try { await attachExpenseReceipt(x.id, files); flash("แนบใบเสร็จแล้ว ✓"); onSaved(); }
    catch (e) { const m = e.message || String(e); flash("ไม่สำเร็จ: " + m + (/expense_attach_receipt|function|schema cache/i.test(m) ? " — ต้องรัน migration 133 ก่อน" : ""), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">แนบใบเสร็จ · {x.title}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>ยอดเบิก {fmtBaht(x.amount)}{x.attachments?.length ? ` · มีใบเสร็จแนบแล้ว ${x.attachments.length} รูป (รูปใหม่จะเพิ่มต่อท้าย)` : " · ยังไม่มีใบเสร็จแนบ"}</div>
          <div className="fld"><span>รูปใบเสร็จ/บิล</span><AttachRow files={files} onChange={setFiles} flash={flash} label="แนบใบเสร็จ" /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy || !files.length} onClick={save}>บันทึกใบเสร็จ</button></div>
      </div>
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
          <div className="fld"><span>🧾 แนบใบเสร็จ/บิล — ยังไม่มีก็ส่งขอเบิกได้เลย แล้วกลับมาแนบทีหลัง (รายการจะขึ้น "ค้างแนบใบเสร็จ" เตือนไว้)</span><AttachRow files={form.attachments} onChange={(a) => set("attachments", a)} flash={flash} label="แนบใบเสร็จ/บิล" /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={() => setForm(null)}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={save}>ส่งขออนุมัติ</button></div>
      </div>
    </div>
  );
}

function ApproveTab({ flash, onOpenDoc }) {
  const [list, setList] = React.useState(null);
  const [statusF, setStatusF] = React.useState("pending");
  const [payFor, setPayFor] = React.useState(null);
  const [vendorPay, setVendorPay] = React.useState(false);   // จ่ายเจ้าหนี้หลายใบในคราวเดียว
  const [rcptFor, setRcptFor] = React.useState(null);   // แนบใบเสร็จแทนพนักงาน (ออฟฟิศ)
  const [q, setQ] = React.useState("");
  const [dateR, setDateR] = React.useState({ from: "", to: "" });
  async function load() { try { setList(await listExpenses()); } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setList([]); } }
  React.useEffect(() => { load(); }, []);
  async function decide(x, status) {
    const lbl = { approved: "อนุมัติ", rejected: "ไม่อนุมัติ", pending: "ยกเลิกอนุมัติ" }[status];
    if (!await confirmDialog(`${lbl}คำขอเบิก "${x.title}" (${fmtBaht(x.amount)}) ?${status === "pending" ? "\n(รายการจะกลับไปสถานะ “รออนุมัติ”)" : ""}`)) return;
    try { await decideExpense(x.id, status); flash(lbl + "แล้ว"); load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  const nRcpt = (list || []).filter(needReceipt).length;
  const shown = (list || []).filter((x) => (statusF === "needReceipt" ? needReceipt(x) : (statusF === "all" || x.status === statusF)) && expMatch(x, q, dateR));
  const cnt = (s) => (list || []).filter((x) => x.status === s).length;
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">อนุมัติ / จ่ายเงินเบิก</div>
        <div className="sec-sub">รออนุมัติ {cnt("pending")} · รอจ่าย {cnt("approved")}{nRcpt > 0 && <b style={{ color: "#d97706" }}> · 📎 ค้างแนบใบเสร็จ {nRcpt}</b>}</div></div>
        <button className="btn-primary" onClick={() => setVendorPay(true)} title="เลือกใบสั่งซื้อค้างจ่ายของร้านเดียวกันหลายใบ ตั้งเบิกจ่ายครั้งเดียว (เหมือนใบวางบิลฝั่งซื้อ)">🏭 จ่ายเจ้าหนี้หลายใบ</button></div>
      <div className="cat-filter">
        {[["pending", "รออนุมัติ"], ["approved", "รอจ่าย"], ["paid", "จ่ายแล้ว"], ["needReceipt", `📎 ค้างแนบใบเสร็จ${nRcpt ? ` (${nRcpt})` : ""}`], ["rejected", "ไม่อนุมัติ"], ["all", "ทั้งหมด"]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)} style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>
      <div className="cat-filter" style={{ marginBottom: 10, alignItems: "center" }}>
        <div className="cat-search" style={{ flex: "1 1 220px" }}><UIcon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา ลูกค้า / เลข PO / พนักงานผู้ขอ…" /></div>
        <DateRangeBar value={dateR} onChange={setDateR} />
      </div>
      {list === null && <div className="empty">กำลังโหลด…</div>}
      {list && shown.length === 0 && <div className="empty">ไม่มีรายการ</div>}
      <div className="job-cards">
        {shown.map((x) => (
          <ExpenseCard key={x.id} x={x} onOpenDoc={onOpenDoc} onSetExpected={async (id, d) => { try { await setExpenseExpectedDate(id, d); flash("ตั้งวันประมาณการจ่ายแล้ว ✓"); load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); } }}>
            {x.status === "pending" && <><button className="btn-primary sm ok" onClick={() => decide(x, "approved")}>✓ อนุมัติ</button>
              <button className="btn-ghost sm" onClick={() => decide(x, "rejected")}>ไม่อนุมัติ</button></>}
            {x.status === "approved" && <><button className="btn-primary sm" onClick={() => setPayFor(x)}><UIcon name="purchase" size={14} color="#fff" /> {Number(x.paid_amount) > 0 ? "จ่ายงวดต่อไป" : "จ่ายเงิน + แนบสลิปโอน"}</button>
              {!(Number(x.paid_amount) > 0) && <button className="btn-ghost sm danger" onClick={() => decide(x, "pending")}>ยกเลิกอนุมัติ</button>}</>}
            {needReceipt(x) && <button className="btn-ghost sm" onClick={() => setRcptFor(x)}>📎 แนบใบเสร็จแทนพนักงาน</button>}
          </ExpenseCard>
        ))}
      </div>
      {payFor && <PayModal x={payFor} onClose={() => setPayFor(null)} onPaid={() => { setPayFor(null); load(); }} flash={flash} />}
      {vendorPay && <PayVendorModal onClose={() => setVendorPay(false)} onDone={() => { setVendorPay(false); setStatusF("pending"); load(); }} flash={flash} />}
      {rcptFor && <ReceiptModal x={rcptFor} onClose={() => setRcptFor(null)} onSaved={() => { setRcptFor(null); load(); }} flash={flash} />}
    </div>
  );
}

// จ่ายเจ้าหนี้หลายใบในคราวเดียว — เหมือนใบวางบิลฝั่งซื้อ: เลือกผู้ขาย → ติ๊ก PO ค้างจ่ายหลายใบ → ตั้งเบิกจ่าย 1 ใบ
// อนุมัติ + จ่ายครบแล้ว ทุก PO ที่เลือกจะขึ้น "จ่ายแล้ว" พร้อมกัน (ไม่อนุมัติ = ทุกใบกลับเป็นยังไม่จ่าย)
function PayVendorModal({ onClose, onDone, flash }) {
  const [pos, setPos] = React.useState(null);
  const [sup, setSup] = React.useState("");
  const [sel, setSel] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    listPurchaseOrders()
      .then((p) => setPos(p.filter((x) => x.status !== "cancelled" && x.paymentStatus === "unpaid" && x.total > 0)))
      .catch((e) => { flash("โหลดใบสั่งซื้อไม่สำเร็จ: " + (e.message || e), true); setPos([]); });
  }, []);
  const supName = (x) => x.supplier?.trim() || "(ไม่ระบุผู้ขาย)";
  const sups = React.useMemo(() => {
    const m = {};
    (pos || []).forEach((x) => { const s = m[supName(x)] || (m[supName(x)] = { n: 0, sum: 0 }); s.n += 1; s.sum += Number(x.total) || 0; });
    return Object.entries(m).sort((a, b) => b[1].sum - a[1].sum);
  }, [pos]);
  const list = (pos || []).filter((x) => supName(x) === sup);
  const chosen = list.filter((x) => sel[x.po_no]);
  const total = chosen.reduce((a, x) => a + (Number(x.total) || 0), 0);
  const allOn = list.length > 0 && chosen.length === list.length;
  async function save() {
    if (!chosen.length) return;
    if (!await confirmDialog({ title: `ตั้งเบิกจ่ายเจ้าหนี้ ${sup}?`, message: `รวม ${chosen.length} ใบ · ${fmtBaht(total)}\nอนุมัติ + จ่ายครบแล้ว ทุกใบจะขึ้น "จ่ายแล้ว" พร้อมกัน`, confirmText: "ตั้งเบิกจ่าย", danger: false })) return;
    setBusy(true);
    try { await requestPoPaymentBatch(chosen); flash(`ตั้งเบิกจ่ายเจ้าหนี้ ${chosen.length} ใบ · ${fmtBaht(total)} แล้ว — รออนุมัติ ✓`); onDone(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: "94vw" }}>
        <div className="modal-head"><div className="modal-title">🏭 จ่ายเจ้าหนี้หลายใบในคราวเดียว</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>เลือกผู้ขาย → ติ๊กใบสั่งซื้อที่ค้างจ่าย → ระบบตั้งเบิกจ่ายให้เป็นใบเดียว (เหมือนใบวางบิลฝั่งซื้อ)</div>
          {pos === null ? <div className="empty">กำลังโหลดใบสั่งซื้อ…</div>
            : pos.length === 0 ? <div className="empty">🎉 ไม่มีใบสั่งซื้อค้างจ่าย</div>
            : (<>
          <label className="fld"><span>ผู้ขาย / เจ้าหนี้</span>
            <select className="inp" value={sup} onChange={(e) => { setSup(e.target.value); setSel({}); }}>
              <option value="">— เลือกผู้ขาย —</option>
              {sups.map(([name, s]) => <option key={name} value={name}>{name} · ค้าง {s.n} ใบ ({fmtBaht(s.sum)})</option>)}
            </select></label>
          {sup && (
            <div style={{ border: "1px solid var(--line)", borderRadius: 11, marginTop: 8, overflow: "hidden" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--line-2)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? {} : Object.fromEntries(list.map((x) => [x.po_no, true])))} />
                เลือกทั้งหมด ({list.length} ใบ)
              </label>
              {list.map((x) => (
                <label key={x.po_no} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderBottom: "1px solid var(--line-2)", cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={!!sel[x.po_no]} onChange={() => setSel((s) => ({ ...s, [x.po_no]: !s[x.po_no] }))} />
                  <b style={{ fontFamily: "var(--mono)" }}>{x.po_no}</b>
                  <span className={"job-badge " + (x.status === "received" ? "b-green" : "b-amber")}>{x.status === "received" ? "รับของแล้ว" : "รอรับของ"}</span>
                  <span className="jo-dim" style={{ flex: 1 }}>{fmtD(x.issue_date || x.created_at)}{x.quote_no ? ` · อ้างอิง ${x.quote_no}` : ""}</span>
                  <b>{fmtBaht(x.total)}</b>
                </label>
              ))}
            </div>
          )}
            </>)}
        </div>
        <div className="modal-foot">
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: chosen.length ? "var(--ink)" : "var(--ink-3)" }}>{chosen.length ? `เลือก ${chosen.length} ใบ · รวม ${fmtBaht(total)}` : "ยังไม่ได้เลือกใบสั่งซื้อ"}</span>
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy || !chosen.length} onClick={save}>ตั้งเบิกจ่าย {chosen.length > 0 ? `${chosen.length} ใบ` : ""}</button>
        </div>
      </div>
    </div>
  );
}

function PayModal({ x, onClose, onPaid, flash }) {
  const total = Math.round((Number(x.amount) || 0) * 100) / 100;
  const already = Math.round((Number(x.paid_amount) || 0) * 100) / 100;
  const remaining = Math.round((total - already) * 100) / 100;
  const [accounts, setAccounts] = React.useState([]);
  const [accountId, setAccountId] = React.useState("");
  const [proof, setProof] = React.useState([]);
  const [payDate, setPayDate] = React.useState(today());
  const [mode, setMode] = React.useState("full");            // full = จ่ายยอดคงเหลือ · partial = แบ่งจ่าย
  const [amount, setAmount] = React.useState(String(remaining));
  const [expDate, setExpDate] = React.useState(x.expected_pay_date || "");   // วันคาดจ่ายยอดที่เหลือ
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { listAccounts().then((a) => { setAccounts(a); setAccountId(a[0]?.id || ""); }).catch(() => {}); }, []);
  const payAmt = mode === "full" ? remaining : (Math.round((Number(amount) || 0) * 100) / 100);
  const leaves = mode === "partial" && payAmt > 0 && payAmt < remaining;   // จ่ายงวดนี้แล้วยังเหลือค้าง
  async function pay() {
    if (!accountId) return flash("เลือกบัญชีที่จ่าย", true);
    if (!payDate) return flash("เลือกวันที่จ่าย", true);
    if (mode === "partial") { if (payAmt <= 0) return flash("ใส่จำนวนเงินที่จ่ายงวดนี้", true); if (payAmt > remaining + 0.005) return flash("จ่ายเกินยอดคงเหลือ", true); }
    setBusy(true);
    try {
      await payExpense(x.id, { accountId, proof, payDate, amount: mode === "full" ? undefined : payAmt, expectedPayDate: leaves ? (expDate || null) : undefined });
      flash(payAmt >= remaining - 0.005 ? "จ่ายครบแล้ว + แจ้งผู้ขอเบิก ✓" : "จ่ายบางส่วนแล้ว ✓ (ตั้งประมาณการยอดค้างในกระแสเงินสด)"); onPaid();
    } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">จ่ายเงินเบิก · ยอดคงเหลือ {fmtBaht(remaining)}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>{x.title}{(x.jobNo || x.job_no) ? ` · งาน ${x.jobNo || x.job_no}` : ""}{x.customerName ? ` · ลูกค้า ${x.customerName}` : ""} · ยอดเบิกรวม {fmtBaht(total)}{already > 0 ? ` · จ่ายแล้ว ${fmtBaht(already)}` : ""}</div>
          <div className="fld"><span>จำนวนที่จ่ายงวดนี้</span>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button type="button" className={"cat-chip" + (mode === "full" ? " on" : "")} style={mode === "full" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}} onClick={() => setMode("full")}>จ่ายทั้งหมด ({fmtBaht(remaining)})</button>
              <button type="button" className={"cat-chip" + (mode === "partial" ? " on" : "")} style={mode === "partial" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}} onClick={() => setMode("partial")}>แบ่งจ่าย</button>
            </div>
            {mode === "partial" && <div className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" max={remaining} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`ไม่เกิน ${remaining}`} /></div>}
            {leaves && <div className="jo-dim" style={{ marginTop: 4, color: "#d97706" }}>จ่ายงวดนี้ {fmtBaht(payAmt)} · เหลือค้าง {fmtBaht(remaining - payAmt)}</div>}
          </div>
          {leaves && <label className="fld"><span>📅 วันคาดว่าจะจ่ายยอดที่เหลือ (ประมาณการในกระแสเงินสด · แก้ไขได้ภายหลัง)</span>
            <input type="date" className="inp" value={expDate} onChange={(e) => setExpDate(e.target.value)} /></label>}
          <div className="fld-row">
            <label className="fld"><span>จ่ายจากบัญชี</span>
              <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} (คงเหลือ {fmtBaht(a.balance)})</option>)}
              </select></label>
            <label className="fld"><span>วันที่จ่าย</span><input type="date" className="inp" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
          </div>
          <div className="fld"><span>💸 แนบสลิปโอนเงิน (หลักฐานการจ่าย)</span><AttachRow files={proof} onChange={setProof} flash={flash} label="แนบสลิปโอนเงิน" /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={busy} onClick={pay}>ยืนยันจ่าย {fmtBaht(payAmt)}</button></div>
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
