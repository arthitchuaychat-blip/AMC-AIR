import React from "react";
import { listAccounts, listAccountEntries, transferFunds, listTransfers, updateTransfer, deleteTransfer, addAccountEntry, deleteAccountEntry, setEntriesReconciled, setAccountOpening, syncBankReceipts, listExpenseCategories, addExpenseCategory, uploadExpenseFile, submitExpense, listMyExpenses, listExpenses, decideExpense, payExpense, unpayExpense, attachExpenseReceipt, setExpenseExpectedDate, setExpenseVat, nudgeExpenseReceipts, listJobOrders, listPurchaseOrders, requestPoPaymentBatch, requestExpensePaymentBatch, reopenPayrollRound } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { EXPENSE_CATS, CAT_BY_NAME, ASSET_GROUPS, PAY_METHODS, PAY_LABEL, kindOf, KIND_LABEL } from "../lib/expenseTaxonomy";
import DocCardHead from "./DocCard";
import { useDocPeek } from "./DocPeek";
import AttachThumb from "./AttachThumb";
import { fmtBaht, ATTACH_ACCEPT, matchText } from "../lib/format";
import DateRangeBar, { inDateRange } from "./DateRangeBar";
import { UIcon } from "../icons";
import { useLang } from "../lib/i18n";
import FilterBar from "./FilterBar";

const OFFICE = ["admin", "exec", "finance", "hr"]; // hr: อนุมัติ/จ่ายเบิก + คุมเงินสดย่อย (v249)
const EST = { pending: { t: "รออนุมัติ", m: "အတည်ပြုရန် စောင့်", c: "b-amber" }, approved: { t: "อนุมัติ · รอจ่าย", m: "အတည်ပြုပြီး · ငွေပေးရန် စောင့်", c: "b-blue" }, rejected: { t: "ไม่อนุมัติ", m: "ပယ်ချ", c: "b-red" }, paid: { t: "จ่ายแล้ว", m: "ပေးပြီး", c: "b-green" } };
// เบิกเงินไปแล้ว (จ่ายครบหรือบางส่วน) แต่ยังไม่มีรูปใบเสร็จ/บิลแนบ → ตามทวงใบเสร็จ
const needReceipt = (x) => x.status !== "rejected" && (x.status === "paid" || Number(x.paid_amount) > 0) && !(x.attachments?.length);
const fmtD = (d) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
const today = () => new Date().toISOString().slice(0, 10);

// multi-file attach (bills / evidence)
function AttachRow({ files, onChange, flash, label }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const inp = React.useRef(null);
  const [busy, setBusy] = React.useState(false);
  async function pick(e) {
    const list = Array.from(e.target.files || []); e.target.value = "";
    if (!list.length) return; setBusy(true);
    try { const urls = []; for (const f of list) urls.push(await uploadExpenseFile(f)); onChange([...(files || []), ...urls]); }
    catch (err) { flash(L("อัปโหลดไม่สำเร็จ: ", "အပ်လုဒ် မအောင်မြင်: ") + (err.message || err), true); }
    setBusy(false);
  }
  return (
    <div className="tb-attach">
      <div className="tb-attach-grid">
        {(files || []).map((u, i) => (<div className="tb-att" key={i}><AttachThumb url={u} /><button type="button" className="tb-att-x" onClick={() => onChange(files.filter((_, j) => j !== i))}><UIcon name="x" size={12} /></button></div>))}
      </div>
      <input ref={inp} type="file" accept={ATTACH_ACCEPT} multiple hidden onChange={pick} />
      <button type="button" className="btn-ghost sm" disabled={busy} onClick={() => inp.current?.click()}><UIcon name="plus" size={13} /> {busy ? L("กำลังอัปโหลด…", "အပ်လုဒ်တင်နေသည်…") : (label || L("แนบบิล/หลักฐาน", "ဘောက်ချာ/အထောက်အထား တွဲ"))}</button>
    </div>
  );
}

// เลือกหมวดค่าใช้จ่าย + สร้างหมวดใหม่ได้ทันที (self-contained: โหลด/รีโหลดรายการหมวดเอง)
function CategoryPicker({ value, onChange, flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [cats, setCats] = React.useState([]);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const load = () => listExpenseCategories().then(setCats).catch(() => {});
  React.useEffect(() => { load(); }, []);
  async function add() {
    const nm = name.trim(); if (!nm) return;
    try { await addExpenseCategory(nm); await load(); onChange(nm); setAdding(false); setName(""); }
    catch (e) { flash && flash(L("เพิ่มหมวดไม่สำเร็จ (รัน migration 094 หรือยัง?): ", "အမျိုးအစား ထည့်မရ (migration 094 ဖွင့်ပြီးပြီလား?): ") + (e.message || e), true); }
  }
  if (adding) return (
    <div style={{ display: "flex", gap: 6 }}>
      <input className="inp" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={L("ชื่อหมวดใหม่ เช่น ค่าขนส่ง", "အမျိုးအစားအမည် ဥပမာ သယ်ယူပို့ဆောင်ခ")} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <button type="button" className="btn-primary sm" onClick={add}>{L("เพิ่ม", "ထည့်")}</button>
      <button type="button" className="btn-ghost sm" onClick={() => { setAdding(false); setName(""); }}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>
    </div>
  );
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select className="inp" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">{L("— ไม่ระบุหมวด —", "— အမျိုးအစား မသတ်မှတ် —")}</option>
        {value && !cats.includes(value) && <option value={value}>{value}</option>}
        {cats.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <button type="button" className="btn-ghost sm" title={L("สร้างหมวดใหม่", "အမျိုးအစားအသစ် ဖန်တီး")} onClick={() => setAdding(true)}><UIcon name="plus" size={14} /> {L("หมวดใหม่", "အမျိုးအစားအသစ်")}</button>
    </div>
  );
}

export default function Expenses({ role, me, onOpenDoc, focus, onFocusConsumed }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const office = OFFICE.includes(role);
  const TABS = [["mine", L("ขอเบิกของฉัน", "ကျွန်ုပ်၏ တောင်းခံစာရင်း")], ...(office ? [["approve", L("อนุมัติ / จ่าย", "အတည်ပြု / ငွေပေး")], ["accounts", L("บัญชี & โอนเงิน", "အကောင့် & ငွေလွှဲ")], ["report", L("เดินบัญชี & กระทบแบงค์", "အကောင့်လှုပ်ရှား & ဘဏ်တိုက်ဆိုင်")]] : [])];
  const [tab, setTab] = React.useState("mine");
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  // มาจากชิป "เบิก #" ในใบ PO → เด้งไปแท็บที่เห็นใบเบิก + ใส่ค้นหาเลข PO ให้เลย (ไม่ค้างที่หน้ารวม)
  const [pend, setPend] = React.useState(null);
  React.useEffect(() => { if (focus) { setPend(focus); setTab(office ? "approve" : "mine"); onFocusConsumed && onFocusConsumed(); } }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const [peekEl, openPeek] = useDocPeek(onOpenDoc);   // ชิปเอกสาร (PO/งาน/QT) → พรีวิวแผงขวาก่อน · เปิดหน้าเต็มค่อยเด้งไปเมนู
  return (
    <div className="adm">
      <div className="adm-head"><div><h1 className="page-title">{L("เบิกจ่าย", "ကုန်ကျစရိတ် တောင်းခံ")} <span className="page-title-en">Expenses</span></h1>
        <p className="page-sub">{L("ขอเบิก (ใบเสร็จยังไม่มีได้) → อนุมัติ → โอนจ่าย + แนบสลิป → เอาเงินไปจ่ายแล้วกลับมาแนบใบเสร็จ · โอนเงินระหว่างบัญชี", "တောင်းခံ (ဘောက်ချာ မရှိသေးလည်းရ) → အတည်ပြု → ငွေလွှဲပေး + ဆလစ်တွဲ → ငွေပေးပြီးမှ ဘောက်ချာ ပြန်တွဲ · အကောင့်ချင်း ငွေလွှဲ")}</p></div></div>
      <div className="cat-filter">
        {TABS.map(([v, l]) => <button key={v} className={"cat-chip" + (tab === v ? " on" : "")} onClick={() => setTab(v)}
          style={tab === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>)}
      </div>
      {tab === "mine" && <MineTab role={role} flash={flash} onOpenDoc={openPeek} initialSearch={pend} onConsumed={() => setPend(null)} />}
      {tab === "approve" && office && <ApproveTab role={role} flash={flash} onOpenDoc={openPeek} initialSearch={pend} onConsumed={() => setPend(null)} />}
      {tab === "accounts" && office && <AccountsTab flash={flash} />}
      {tab === "report" && office && <ReportTab flash={flash} />}
      {peekEl}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

function ExpenseCard({ x, children, onOpenDoc, onSetExpected, onSetVat }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const st = EST[x.status] || EST.pending;
  const paid = Math.round((Number(x.paid_amount) || 0) * 100) / 100;
  const total = Math.round((Number(x.amount) || 0) * 100) / 100;
  const partial = x.status !== "paid" && paid > 0 && paid < total;   // จ่ายแล้วบางส่วน
  const [poOpen, setPoOpen] = React.useState(false);
  const pos = x.poDetails?.length ? x.poDetails : (x.poNos?.length ? x.poNos : x.poNo ? [x.poNo] : []).map((n) => ({ po_no: n }));
  return (
    <div className="card job-card doc2">
      <DocCardHead no={L("เบิก #", "တောင်းခံ #") + String(x.id || "").slice(0, 8).toUpperCase()}
        badges={<>
          <span className={"job-badge " + st.c}>{L(st.t, st.m)}</span>
          <span className="job-badge" style={x.entity === "personal" ? { background: "#f5f3ff", color: "#6d28d9", borderColor: "#ddd6fe" } : { background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}>{x.entity === "personal" ? L("👤 บุคคล", "👤 ပုဂ္ဂိုလ်") : L("🏢 บริษัท", "🏢 ကုမ္ပဏီ")}</span>
          {partial && <span className="job-badge b-amber">{L("จ่ายบางส่วน", "တစ်စိတ်တစ်ပိုင်း ပေးပြီး")}</span>}
          {needReceipt(x) && <span className="job-badge b-amber">📎 {L("ค้างแนบใบเสร็จ", "ဘောက်ချာ တွဲရန် ကျန်")}</span>}
        </>}
        title={x.title} titleFallback={L("— ไม่ระบุรายการ —", "— အမည် မသတ်မှတ် —")}
        sub={[x.category, x.asset_tag ? "📍 " + x.asset_tag : null, x.pay_method ? PAY_LABEL[x.pay_method] : null, x.kind === "cost" ? "🔧 ต้นทุนงาน" : x.kind === "opex" ? "🏢 ค่าใช้จ่าย" : null, x.jobTitle ? "📋 " + x.jobTitle : null, pos.length > 1 ? L(`รวม ${pos.length} ใบสั่งซื้อ`, `စုစုပေါင်း ဝယ်ယူလွှာ ${pos.length} စောင်`) : null, Number(x.vat_amt) > 0 ? `🧾 ${L("ภาษีซื้อ", "ဝယ်ခွန်")} ${fmtBaht(x.vat_amt)}` : null].filter(Boolean).join(" · ") || null}
        by={x.requesterName} date={x.created_at}
        amountNode={partial ? (
          <div className="rec-amt-bd">
            <div className="rab-row"><span>{L("ยอดเบิก", "တောင်းခံ ပမာဏ")}</span><b>{fmtBaht(total)}</b></div>
            <div className="rab-row rab-wht"><span>{L("จ่ายแล้ว", "ပေးပြီး")}</span><b>− {fmtBaht(paid)}</b></div>
            <div className="rab-row rab-net"><span>{L("คงเหลือ", "ကျန်ငွေ")}</span><b>{fmtBaht(total - paid)}</b></div>
          </div>
        ) : null}
        amountLabel={L("ยอดเบิก", "တောင်းခံ ပမာဏ")} amount={x.amount}
        partyIcon="👤" customer={x.customerName ? { name: x.customerName } : null} />
      {/* วันรับ/ส่งสินค้า (ดึงจาก PO ที่ผูก — เหมือนในเมนูใบสั่งซื้อ) */}
      {pos.some((p) => p.delivery_date || p.delivery_method) && (
        <div className="po-docrow" style={{ padding: "8px 2px 0" }}>
          {pos.filter((p) => p.delivery_date || p.delivery_method).map((p) => {
            const m = p.delivery_method === "pickup" ? "🚗 ไปรับเอง" : p.delivery_method === "delivery" ? "🚚 ผู้ขายมาส่ง" : p.delivery_method === "site" ? "🏗️ จัดส่งหน้างาน" : "📦 รับ/ส่ง";
            const d = p.delivery_date ? new Date(p.delivery_date + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
            return <span key={p.po_no} className="po-doctag" style={{ background: "#fff7ed", borderColor: "#fdba74", color: "#c2410c" }}>{m}{d ? ` · กำหนด ${d}` : ""}{pos.length > 1 ? ` · ${p.po_no}` : ""}</span>;
          })}
        </div>
      )}
      {(pos.length > 0 || x.jobNo || x.job_no || x.quoteNo) && (
        <div className="doc-links"><span className="doc-links-l">🔗 {L("เชื่อมโยง", "ချိတ်ဆက်")}</span>
          {pos.map((p) => <button key={p.po_no} type="button" className="doclink dl-po" title={L("ดูใบสั่งซื้อ (พรีวิวด้านขวา)", "ဝယ်ယူလွှာ ကြည့် (ညာဘက် အစမ်းကြည့်)")} onClick={() => onOpenDoc && onOpenDoc("po", p.po_no)}>{L("สั่งซื้อ", "ဝယ်ယူ")} {p.po_no}</button>)}
          {(x.jobNo || x.job_no) && <button type="button" className="doclink dl-job" onClick={() => onOpenDoc && onOpenDoc("job", x.jobNo || x.job_no)}>{L("งาน", "အလုပ်")} {x.jobNo || x.job_no}</button>}
          {x.quoteNo && <button type="button" className="doclink dl-quote" onClick={() => onOpenDoc && onOpenDoc("quote", x.quoteNo)}>{x.quoteNo}</button>}
          {pos.length > 1 && <button type="button" className="btn-ghost sm" style={{ marginLeft: "auto" }} onClick={() => setPoOpen((v) => !v)}>{poOpen ? L("ซ่อนรายการ ▲", "စာရင်း ဖျောက် ▲") : L(`กางดูรายการ PO (${pos.length}) ▼`, `PO စာရင်း ဖွင့်ကြည့် (${pos.length}) ▼`)}</button>}
        </div>
      )}
      {poOpen && pos.length > 1 && (
        <div className="doc2-extra bn-invlist" style={{ borderTop: 0, marginTop: 0 }}>
          {pos.map((p, i) => (
            <div className="bn-invrow" key={p.po_no}>
              <span className="jo-dim" style={{ width: 18, textAlign: "right" }}>{i + 1}.</span>
              <button type="button" className="sub-job-link" onClick={() => onOpenDoc && onOpenDoc("po", p.po_no)}>{p.po_no}</button>
              {p.customerName && <span className="jo-dim">👤 {p.customerName}</span>}
              {p.quote_no && <span className="jo-dim">{L("อ้างอิง", "ကိုးကား")} {p.quote_no}</span>}
              <b style={{ flex: 1, textAlign: "right" }}>{p.total > 0 ? fmtBaht(p.total) : ""}</b>
              <button type="button" className="btn-ghost sm" onClick={() => onOpenDoc && onOpenDoc("po", p.po_no)}>{L("ดูใบ ›", "လွှာကြည့် ›")}</button>
            </div>
          ))}
        </div>
      )}
      {(x.decide_note || (x.note && pos.length <= 1)) && (
        <div className="doc2-extra jo-dim" style={{ fontSize: 12.5 }}>
          {x.note && pos.length <= 1 ? <div>{x.note}</div> : null}
          {x.decide_note ? <div>{L("หมายเหตุ: ", "မှတ်ချက်: ")}{x.decide_note}</div> : null}
        </div>
      )}
      {partial && onSetExpected && (
        <div className="job-lines"><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)", padding: "2px 0" }}>
          📅 {L(`ยอดค้าง ${fmtBaht(total - paid)} ตั้งประมาณการจ่ายในกระแสเงินสดวันที่:`, `ကျန်ငွေ ${fmtBaht(total - paid)} ငွေသားစီးဆင်းမှုတွင် ခန့်မှန်း ငွေပေးရက်:`)}
          <input type="date" className="inp" style={{ width: 160, padding: "4px 8px" }} value={x.expected_pay_date || ""} onChange={(e) => onSetExpected(x.id, e.target.value)} />
        </div></div>
      )}
      {onSetVat && x.status !== "rejected" && x.category !== "เงินเดือน" && (() => { const v7 = Math.round((Number(x.amount) || 0) * 7 / 107 * 100) / 100; return (
        <div className="job-lines"><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink-2)", flexWrap: "wrap", padding: "2px 0" }}>
          🧾 <span>{L("ภาษีซื้อ (VAT) ในบิลนี้:", "ဤဘီလ်၏ ဝယ်ခွန် (VAT):")}</span>
          <span className="inp inp-unit" style={{ width: 120 }}><span className="unit-pre">฿</span>
            <input type="number" min="0" step="0.01" defaultValue={Number(x.vat_amt) || 0} onBlur={(e) => onSetVat(x.id, e.target.value, x)} /></span>
          <button type="button" className="btn-ghost sm" onClick={() => onSetVat(x.id, v7, x)} title={L("บิลราคารวม VAT → ถอด 7/107", "ဘီလ်စျေးနှုန်း VAT ပါ → 7/107 ခွဲ")}>= 7% ({fmtBaht(v7)})</button>
          {Number(x.vat_amt) > 0 ? <span style={{ color: "#0d9488", fontWeight: 700 }}>{L("มีใบกำกับภาษี", "အခွန်ပြေစာ ရှိ")}</span> : <span className="jo-dim">{L("ไม่มี VAT", "VAT မရှိ")}</span>}
        </div></div>
      ); })()}
      {(x.attachments?.length > 0 || x.payment_proof?.length > 0) && (
        <div className="exp-atts">
          {x.attachments?.length > 0 && <div className="exp-att-grp"><span>🧾 {L("ใบเสร็จ/บิล:", "ဘောက်ချာ/ဘီလ်:")}</span><div className="tb-attach-grid">{x.attachments.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div></div>}
          {x.payment_proof?.length > 0 && <div className="exp-att-grp"><span>💸 {L("สลิปโอนเงิน:", "ငွေလွှဲ ဆလစ်:")}</span><div className="tb-attach-grid">{x.payment_proof.map((u, i) => <div className="tb-att" key={i}><AttachThumb url={u} /></div>)}</div></div>}
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

function MineTab({ role, flash, onOpenDoc, initialSearch, onConsumed }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [list, setList] = React.useState(null);
  const [jobs, setJobs] = React.useState([]);
  const [form, setForm] = React.useState(null);
  const [rcptFor, setRcptFor] = React.useState(null);   // รายการที่กำลังแนบใบเสร็จย้อนหลัง
  const [q, setQ] = React.useState("");
  const [dateR, setDateR] = React.useState({ from: "", to: "" });
  async function load() { try { setList(await listMyExpenses()); } catch (e) { flash(L("โหลดไม่สำเร็จ: ", "ဖွင့်မရ: ") + (e.message || e), true); setList([]); } }
  React.useEffect(() => { load(); listJobOrders(role === "tech" || role === "assistant" || role === "lead_tech" ? { fieldOnly: true, team: null } : {}).then((j) => setJobs(j.filter((x) => x.status !== "cancelled"))).catch(() => {}); }, []);
  React.useEffect(() => { if (initialSearch) { setQ(initialSearch); onConsumed && onConsumed(); } }, [initialSearch]); // eslint-disable-line react-hooks/exhaustive-deps · จากชิปในใบ PO → ใส่ค้นหาเลข PO
  const pendRcpt = (list || []).filter(needReceipt).length;
  const activeCount = (q ? 1 : 0) + (dateR.from || dateR.to ? 1 : 0);
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">{L("คำขอเบิกของฉัน", "ကျွန်ုပ်၏ တောင်းခံစာရင်း")}</div><div className="sec-sub">{L("เบิกค่าใช้จ่ายทั่วไป หรือเบิกจากใบงาน (ค่าใช้จ่ายงานจะรวมเป็นต้นทุนงาน)", "ယေဘုယျ ကုန်ကျစရိတ် သို့မဟုတ် အလုပ်လွှာမှ တောင်းခံ (အလုပ်စရိတ်ကို အလုပ်ကုန်ကျစရိတ်တွင် ပေါင်းမည်)")}
        {pendRcpt > 0 && <b style={{ color: "#d97706" }}> · 📎 {L(`ค้างแนบใบเสร็จ ${pendRcpt} รายการ`, `ဘောက်ချာ တွဲရန်ကျန် ${pendRcpt} ခု`)}</b>}</div></div>
        <button className="btn-primary" onClick={() => setForm({ title: "", amount: "", category: "", job_no: "", note: "", attachments: [], has_vat: false })}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> {L("ขอเบิกใหม่", "အသစ် တောင်းခံ")}</button></div>
      <FilterBar id="expenses-mine" count={activeCount}>
        <div className="cat-filter" style={{ marginBottom: 10, alignItems: "center" }}>
          <div className="cat-search" style={{ flex: "1 1 220px" }}><UIcon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("ค้นหา ลูกค้า / เลข PO / ชื่อรายการ…", "ရှာဖွေ ဖောက်သည် / PO နံပါတ် / အမည်…")} /></div>
          <DateRangeBar value={dateR} onChange={setDateR} />
        </div>
      </FilterBar>
      {list === null && <div className="empty">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div>}
      {list && list.length === 0 && <div className="empty">{L("ยังไม่มีคำขอเบิก", "တောင်းခံစာရင်း မရှိသေးပါ")}</div>}
      {list && list.length > 0 && (list || []).filter((x) => expMatch(x, q, dateR)).length === 0 && <div className="empty">{L("ไม่พบรายการตามที่ค้นหา", "ရှာဖွေမှုနှင့် ကိုက်ညီသည် မတွေ့ပါ")}</div>}
      <div className="job-cards">{(list || []).filter((x) => expMatch(x, q, dateR)).map((x) => (
        <ExpenseCard key={x.id} x={x} onOpenDoc={onOpenDoc}>
          {x.status !== "rejected" && (
            needReceipt(x)
              ? <button className="btn-primary sm" onClick={() => setRcptFor(x)}>📎 {L("แนบใบเสร็จ", "ဘောက်ချာ တွဲ")}</button>
              : (x.status === "paid" || Number(x.paid_amount) > 0) && <button className="btn-ghost sm" onClick={() => setRcptFor(x)}>📎 {L("แนบใบเสร็จเพิ่ม", "ဘောက်ချာ ထပ်တွဲ")}</button>
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
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [files, setFiles] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  async function save() {
    if (!files.length) return flash(L("แนบรูปใบเสร็จก่อน", "ဘောက်ချာ ဓာတ်ပုံ အရင်တွဲပါ"), true);
    setBusy(true);
    try { await attachExpenseReceipt(x.id, files); flash(L("แนบใบเสร็จแล้ว ✓", "ဘောက်ချာ တွဲပြီး ✓")); onSaved(); }
    catch (e) { const m = e.message || String(e); flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + m + (/expense_attach_receipt|function|schema cache/i.test(m) ? L(" — ต้องรัน migration 133 ก่อน", " — migration 133 အရင်ဖွင့်ရန်") : ""), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">{L("แนบใบเสร็จ · ", "ဘောက်ချာ တွဲ · ")}{x.title}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>{L("ยอดเบิก ", "တောင်းခံ ပမာဏ ")}{fmtBaht(x.amount)}{x.attachments?.length ? L(` · มีใบเสร็จแนบแล้ว ${x.attachments.length} รูป (รูปใหม่จะเพิ่มต่อท้าย)`, ` · ဘောက်ချာ ${x.attachments.length} ပုံ တွဲပြီး (ပုံအသစ် နောက်မှ ဆက်ထည့်မည်)`) : L(" · ยังไม่มีใบเสร็จแนบ", " · ဘောက်ချာ မတွဲရသေး")}</div>
          <div className="fld"><span>{L("รูปใบเสร็จ/บิล", "ဘောက်ချာ/ဘီလ် ဓာတ်ပုံ")}</span><AttachRow files={files} onChange={setFiles} flash={flash} label={L("แนบใบเสร็จ", "ဘောက်ချာ တွဲ")} /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>
          <button className="btn-primary" disabled={busy || !files.length} onClick={save}>{L("บันทึกใบเสร็จ", "ဘောက်ချာ သိမ်း")}</button></div>
      </div>
    </div>
  );
}

function ExpenseForm({ form, setForm, jobs, onSaved, flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [customMode, setCustomMode] = React.useState(!!form.category && !CAT_BY_NAME[form.category]);
  const cat = CAT_BY_NAME[form.category];
  const assetList = cat?.assets ? ASSET_GROUPS[cat.assets] : null;
  const curKind = kindOf(form.category, form.job_no);
  async function save() {
    if (!form.title.trim()) return flash(L("ใส่ชื่อรายการ", "အမည် ဖြည့်ပါ"), true);
    if (!(Number(form.amount) > 0)) return flash(L("ใส่จำนวนเงิน", "ပမာဏ ဖြည့်ပါ"), true);
    setBusy(true);
    const vat_amt = form.has_vat ? Math.round((Number(form.amount) || 0) * 7 / 107 * 100) / 100 : 0;   // บิลราคารวม VAT → ถอดภาษีซื้อ 7/107
    const kind = kindOf(form.category, form.job_no);   // ต้นทุน(cost) ถ้าหมวด cost หรือผูกงาน · ไม่งั้น opex
    try { await submitExpense({ ...form, vat_amt, kind, pay_method: form.pay_method || "reimburse", asset_tag: form.asset_tag || null }); flash(L("ส่งคำขอเบิกแล้ว รออนุมัติ ✓", "တောင်းခံစာ တင်ပြီး · အတည်ပြုရန် စောင့် ✓")); onSaved(); }
    catch (e) { flash(L("ส่งไม่สำเร็จ: ", "တင်၍ မအောင်မြင်: ") + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={() => setForm(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <div className="modal-head"><div className="modal-title">{L("ขอเบิกค่าใช้จ่าย", "ကုန်ကျစရိတ် တောင်းခံ")}</div><button className="modal-x" onClick={() => setForm(null)}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>{L("รายการ/เรื่องที่เบิก", "တောင်းခံသည့် အကြောင်းအရာ")}</span><input className="inp" value={form.title} autoFocus onChange={(e) => set("title", e.target.value)} placeholder={L("เช่น ค่าน้ำมัน / ค่าทางด่วน / ซื้อของหน้างาน", "ဥပမာ ဆီဖိုး / အမြန်လမ်းခ / လုပ်ငန်းခွင် ပစ္စည်းဝယ်")} /></label>
          <div className="fld-row">
            <label className="fld"><span>{L("จำนวนเงิน (บาท)", "ပမာဏ (ဘတ်)")}</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></span></label>
            <label className="fld"><span>{L("หมวด", "အမျိုးအစား")} <span style={{ fontSize: 11, fontWeight: 700, color: curKind === "cost" ? "#b45309" : "#1d4ed8" }}>· {KIND_LABEL[curKind]}</span></span>
              <select className="inp" value={customMode ? "__custom__" : (form.category || "")} onChange={(e) => { const v = e.target.value; if (v === "__custom__") { setCustomMode(true); set("category", ""); set("asset_tag", ""); } else { setCustomMode(false); set("category", v); set("asset_tag", ""); } }}>
                <option value="">{L("— เลือกหมวด —", "— အမျိုးအစား ရွေး —")}</option>
                <optgroup label="🔧 ต้นทุนงาน">{EXPENSE_CATS.filter((c) => c.kind === "cost").map((c) => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}</optgroup>
                <optgroup label="🏢 ค่าใช้จ่ายดำเนินงาน">{EXPENSE_CATS.filter((c) => c.kind === "opex").map((c) => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}</optgroup>
                <option value="__custom__">✏️ {L("อื่นๆ (ระบุเอง)", "အခြား")}</option>
              </select></label>
          </div>
          {customMode && <label className="fld"><span>{L("ระบุหมวดเอง", "အမျိုးအစား ကိုယ်တိုင်ဖြည့်")}</span><input className="inp" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder={L("พิมพ์ชื่อหมวด", "အမျိုးအစား ရိုက်ထည့်")} /></label>}
          {assetList && <label className="fld"><span>{cat.icon} {L("รายการย่อย", "အသေးစိတ်")} — {cat.name}</span>
            <select className="inp" value={form.asset_tag || ""} onChange={(e) => set("asset_tag", e.target.value)}>
              <option value="">{L("— เลือก" + (cat.assets.startsWith("veh") ? "คัน" : cat.assets === "phone" ? "เบอร์" : "สถานที่") + " —", "— ရွေး —")}</option>
              {assetList.map((a) => <option key={a} value={a}>{a}</option>)}
            </select></label>}
          <label className="fld"><span>{L("วิธีจ่าย", "ငွေပေးနည်း")}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {PAY_METHODS.map(([k, l, d]) => <button type="button" key={k} title={d} onClick={() => set("pay_method", k)} className={"cat-chip" + ((form.pay_method || "reimburse") === k ? " on" : "")} style={(form.pay_method || "reimburse") === k ? { background: "#111", color: "#fff", borderColor: "#111", flex: 1 } : { flex: 1 }}>{l}</button>)}
            </div></label>
          <label className="fld" style={{ flexDirection: "row", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={!!form.has_vat} onChange={(e) => set("has_vat", e.target.checked)} style={{ width: 16, height: 16 }} />
            <span style={{ margin: 0 }}>🧾 {L("บิลนี้มีใบกำกับภาษีซื้อ VAT 7% (ยอดข้างบนรวม VAT แล้ว)", "ဤဘီလ်တွင် ဝယ်ခွန် VAT 7% ပါသည် (ပမာဏတွင် VAT ပါပြီး)")}
              {form.has_vat && Number(form.amount) > 0 ? <b style={{ color: "#0d9488" }}> · {L("ภาษีซื้อ", "ဝယ်ခွန်")} ฿{(Math.round(Number(form.amount) * 7 / 107 * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}</b> : ""}</span>
          </label>
          <label className="fld"><span>{L("เบิกจากใบงาน (ถ้ามี — จะรวมเป็นต้นทุนงาน)", "အလုပ်လွှာမှ တောင်းခံ (ရှိလျှင် — အလုပ်ကုန်ကျစရိတ်တွင် ပေါင်းမည်)")}</span>
            <select className="inp" value={form.job_no} onChange={(e) => set("job_no", e.target.value)}>
              <option value="">{L("— ไม่ผูกกับงาน (ค่าใช้จ่ายทั่วไป) —", "— အလုပ်နှင့် မချိတ် (ယေဘုယျ စရိတ်) —")}</option>
              {jobs.map((j) => <option key={j.job_no} value={j.job_no}>{j.job_no} · {j.customerName || j.title || L("งาน", "အလုပ်")}</option>)}
            </select></label>
          <label className="fld"><span>{L("รายละเอียดเพิ่มเติม", "အသေးစိတ် ထပ်ဖြည့်")}</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={L("อธิบายรายละเอียดค่าใช้จ่าย (ไม่บังคับ)", "ကုန်ကျစရိတ် အသေးစိတ် ရှင်းပြပါ (မဖြစ်မနေ မဟုတ်)")} /></label>
          <div className="fld"><span>🧾 {L('แนบใบเสร็จ/บิล — ยังไม่มีก็ส่งขอเบิกได้เลย แล้วกลับมาแนบทีหลัง (รายการจะขึ้น "ค้างแนบใบเสร็จ" เตือนไว้)', 'ဘောက်ချာ/ဘီလ် တွဲ — မရှိသေးလည်း တောင်းခံ တင်နိုင် · နောက်မှ ပြန်တွဲ (စာရင်းတွင် "ဘောက်ချာ တွဲရန်ကျန်" ပြမည်)')}</span><AttachRow files={form.attachments} onChange={(a) => set("attachments", a)} flash={flash} label={L("แนบใบเสร็จ/บิล", "ဘောက်ချာ/ဘီလ် တွဲ")} /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={() => setForm(null)}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{L("ส่งขออนุมัติ", "အတည်ပြုရန် တင်")}</button></div>
      </div>
    </div>
  );
}

function ApproveTab({ role, flash, onOpenDoc, initialSearch, onConsumed }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [list, setList] = React.useState(null);
  const [statusF, setStatusF] = React.useState("pending");
  const [payFor, setPayFor] = React.useState(null);
  const [vendorPay, setVendorPay] = React.useState(false);   // จ่ายเจ้าหนี้หลายใบในคราวเดียว
  const [rcptFor, setRcptFor] = React.useState(null);   // แนบใบเสร็จแทนพนักงาน (ออฟฟิศ)
  const [q, setQ] = React.useState("");
  const [dateR, setDateR] = React.useState({ from: "", to: "" });
  async function load() { try { setList(await listExpenses()); } catch (e) { flash(L("โหลดไม่สำเร็จ: ", "ဖွင့်မရ: ") + (e.message || e), true); setList([]); } }
  React.useEffect(() => { load(); }, []);
  // จากชิปในใบ PO → ใส่ค้นหาเลข PO + เปิดดูทุกสถานะ (ใบเบิกอาจจ่ายแล้ว จะได้ไม่หลุด)
  React.useEffect(() => { if (initialSearch) { setQ(initialSearch); setStatusF("all"); onConsumed && onConsumed(); } }, [initialSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  async function decide(x, status) {
    const lbl = { approved: L("อนุมัติ", "အတည်ပြု"), rejected: L("ไม่อนุมัติ", "ပယ်ချ"), pending: L("ยกเลิกอนุมัติ", "အတည်ပြုမှု ပယ်ဖျက်") }[status];
    if (!await confirmDialog(L(`${lbl}คำขอเบิก "${x.title}" (${fmtBaht(x.amount)}) ?${status === "pending" ? "\n(รายการจะกลับไปสถานะ “รออนุมัติ”)" : ""}`, `တောင်းခံစာ "${x.title}" (${fmtBaht(x.amount)}) ကို ${lbl} မလား?${status === "pending" ? "\n(စာရင်းသည် “အတည်ပြုရန် စောင့်” အခြေအနေသို့ ပြန်သွားမည်)" : ""}`))) return;
    try { await decideExpense(x.id, status); flash(L(lbl + "แล้ว", lbl + "ပြီး")); load(); } catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
  }
  // ยกเลิกการจ่ายเงิน (ผู้บริหารเท่านั้น) — คืนใบกลับเป็น "อนุมัติ · รอจ่าย" + ถอนเงินออก/คืน PO/กระแสเงินสด
  async function unpay(x) {
    const reason = await confirmDialog({ title: `ยกเลิกการจ่ายเงินเบิก "${x.title}" (${fmtBaht(x.paid_amount || x.amount)}) ?`, message: "ใบจะกลับเป็น “อนุมัติ · รอจ่าย” · รายการเงินออกในบัญชี/กระแสเงินสดจะถูกถอนออก · PO ที่ผูกกลับเป็นยังไม่จ่าย", confirmText: "ยกเลิกการจ่าย", prompt: { label: "เหตุผลที่ยกเลิกการจ่าย", placeholder: "เช่น โอนผิดบัญชี · จ่ายผิดยอด · ยกเลิกงาน", required: true } });
    if (reason === false) return;
    try { await unpayExpense(x.id, reason); flash("ยกเลิกการจ่ายแล้ว — กลับเป็นรอจ่าย ✓"); load(); } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  // ใบเบิกเงินเดือน (หมวด "เงินเดือน") — ยกเลิกแล้วต้องเปิดรอบเงินเดือนกลับให้ทำใหม่ (ลบใบทั้งรอบ + คืนสลิปเป็นร่าง)
  const salaryPeriod = (x) => (x.category === "เงินเดือน" ? ((x.title || "").match(/รอบ\s*(\d{4}-\d{2})/) || [])[1] || null : null);
  async function reopenPayroll(x) {
    const period = salaryPeriod(x);
    if (!period) return flash("ไม่พบรอบเงินเดือนในใบนี้", true);
    const reason = await confirmDialog({ title: `ยกเลิกใบเบิกเงินเดือน + เปิดรอบ ${period} ใหม่?`,
      message: `• ลบใบเบิกเงินเดือน "ทุกคน" ของรอบ ${period} ที่ยังไม่ได้จ่าย\n• เปิดรอบเงินเดือนกลับให้แก้/คำนวณใหม่ได้ (สลิปกลับเป็นร่าง)\n• คืนเบิกล่วงหน้า/OT/เงินยืม กลับสภาพ\n\n➡️ ทำเงินเดือนใหม่แล้วกด “ส่งเข้าเบิกจ่าย” อีกครั้งที่แท็บเงินเดือน`,
      confirmText: "ยกเลิก + เปิดรอบใหม่", prompt: { label: "เหตุผลที่ยกเลิก", placeholder: "เช่น คิด OT ผิด · ยอดหักผิด", required: true } });
    if (reason === false) return;
    try { const r = await reopenPayrollRound(period); flash(`ยกเลิก + เปิดรอบ ${period} ใหม่แล้ว ✓ (ลบใบเบิก ${r.removed} ใบ) — ไปทำเงินเดือนใหม่ที่แท็บ HR › เงินเดือน`); load(); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
  }
  // นำใบเบิกที่ "ไม่อนุมัติ" กลับมา — ใบเงินเดือนกลับเป็น "รอจ่าย" ทันที · ใบอื่นกลับเป็น "รออนุมัติ"
  async function restore(x) {
    const toApproved = !!salaryPeriod(x);
    const lbl = toApproved ? L("รอจ่าย", "ငွေပေးရန်စောင့်") : L("รออนุมัติ", "အတည်ပြုရန်စောင့်");
    if (!await confirmDialog(L(`นำใบเบิก "${x.title}" (${fmtBaht(x.amount)}) กลับมาเป็น “${lbl}”?`, `တောင်းခံလွှာ "${x.title}" (${fmtBaht(x.amount)}) ကို “${lbl}” အဖြစ် ပြန်ယူမလား?`))) return;
    try { await decideExpense(x.id, toApproved ? "approved" : "pending"); flash(L(`นำกลับมาแล้ว ✓ (${lbl})`, `ပြန်ယူပြီး ✓ (${lbl})`)); load(); }
    catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
  }
  // ทวงใบเสร็จ — แจ้งเตือนผู้ขอเบิกทุกคนที่จ่ายเงินไปแล้วแต่ยังไม่แนบใบเสร็จ
  async function nudge() {
    const ids = (list || []).filter(needReceipt).map((x) => x.id);
    if (!ids.length) return flash(L("ไม่มีรายการค้างใบเสร็จ", "ဘောက်ချာ ကျန်နေသည် မရှိ"));
    if (!await confirmDialog(L(`ส่งแจ้งเตือนทวงใบเสร็จ ${ids.length} รายการ ให้ผู้ขอเบิก?`, `ဘောက်ချာ ကျန် ${ids.length} ခုအတွက် တောင်းခံသူများကို အသိပေးမလား?`))) return;
    try { const r = await nudgeExpenseReceipts(ids); flash(L(`ทวงแล้ว ✓ แจ้ง ${r.notified} คน`, `တောင်းပြီး ✓ ${r.notified} ဦး အသိပေးပြီး`)); } catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
  }
  const nRcpt = (list || []).filter(needReceipt).length;
  const shown = (list || []).filter((x) => (statusF === "needReceipt" ? needReceipt(x) : (statusF === "all" || x.status === statusF)) && expMatch(x, q, dateR));
  const cnt = (s) => (list || []).filter((x) => x.status === s).length;
  const activeCount = (statusF !== "pending" ? 1 : 0) + (q ? 1 : 0) + (dateR.from || dateR.to ? 1 : 0);
  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">{L("อนุมัติ / จ่ายเงินเบิก", "အတည်ပြု / တောင်းခံငွေ ပေးချေ")}</div>
        <div className="sec-sub">{L(`รออนุมัติ ${cnt("pending")} · รอจ่าย ${cnt("approved")}`, `အတည်ပြုရန် စောင့် ${cnt("pending")} · ငွေပေးရန် စောင့် ${cnt("approved")}`)}{nRcpt > 0 && <b style={{ color: "#d97706" }}> · 📎 {L(`ค้างแนบใบเสร็จ ${nRcpt}`, `ဘောက်ချာ တွဲရန်ကျန် ${nRcpt}`)}</b>}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {nRcpt > 0 && <button className="btn-ghost" style={{ color: "#d97706", borderColor: "#fcd34d" }} onClick={nudge} title={L("แจ้งเตือนผู้ขอเบิกที่จ่ายเงินไปแล้วให้กลับมาแนบใบเสร็จ", "ငွေပေးပြီးသူများကို ဘောက်ချာ ပြန်တွဲရန် အသိပေး")}>🔔 {L("ทวงใบเสร็จ", "ဘောက်ချာ တောင်း")} ({nRcpt})</button>}
          <button className="btn-primary" onClick={() => setVendorPay(true)} title={L("เลือกใบสั่งซื้อค้างจ่ายของร้านเดียวกันหลายใบ ตั้งเบิกจ่ายครั้งเดียว (เหมือนใบวางบิลฝั่งซื้อ)", "တူညီသော ရောင်းသူ၏ ငွေပေးရန်ကျန် ဝယ်ယူလွှာ များစွာကို ရွေး၍ တစ်ကြိမ်တည်း တောင်းခံ (ဝယ်ဘက် ငွေတောင်းခံစာကဲ့သို့)")}>🏭 {L("จ่ายเจ้าหนี้หลายใบ", "မြီရှင် များစွာ ပေးချေ")}</button>
        </div></div>
      <FilterBar id="expenses-approve" count={activeCount}>
        <div className="cat-filter">
        {[["pending", L("รออนุมัติ", "အတည်ပြုရန် စောင့်")], ["approved", L("รอจ่าย", "ငွေပေးရန် စောင့်")], ["paid", L("จ่ายแล้ว", "ပေးပြီး")], ["needReceipt", `📎 ${L("ค้างแนบใบเสร็จ", "ဘောက်ချာ တွဲရန်ကျန်")}${nRcpt ? ` (${nRcpt})` : ""}`], ["rejected", L("ไม่อนุมัติ", "ပယ်ချ")], ["all", L("ทั้งหมด", "အားလုံး")]].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (statusF === v ? " on" : "")} onClick={() => setStatusF(v)} style={statusF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>
      <div className="cat-filter" style={{ marginBottom: 10, alignItems: "center" }}>
        <div className="cat-search" style={{ flex: "1 1 220px" }}><UIcon name="search" size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L("ค้นหา ลูกค้า / เลข PO / พนักงานผู้ขอ / หมายเหตุ…", "ရှာဖွေ ဖောက်သည် / PO နံပါတ် / တောင်းခံသူ / မှတ်ချက်…")} /></div>
        <DateRangeBar value={dateR} onChange={setDateR} />
      </div>
      </FilterBar>
      {list === null && <div className="empty">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div>}
      {list && shown.length === 0 && <div className="empty">{L("ไม่มีรายการ", "စာရင်း မရှိပါ")}</div>}
      <div className="job-cards">
        {shown.map((x) => (
          <ExpenseCard key={x.id} x={x} onOpenDoc={onOpenDoc} onSetExpected={async (id, d) => { try { await setExpenseExpectedDate(id, d); flash(L("ตั้งวันประมาณการจ่ายแล้ว ✓", "ခန့်မှန်း ငွေပေးရက် သတ်မှတ်ပြီး ✓")); load(); } catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); } }}
            onSetVat={async (id, v, ex) => { const nv = Math.max(0, Math.round((Number(v) || 0) * 100) / 100); if (Math.round((Number(ex.vat_amt) || 0) * 100) / 100 === nv) return; try { await setExpenseVat(id, nv); flash(L("บันทึกภาษีซื้อแล้ว ✓", "ဝယ်ခွန် သိမ်းပြီး ✓")); load(); } catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); } }}>
            {x.status === "pending" && <><button className="btn-primary sm ok" onClick={() => decide(x, "approved")}>✓ {L("อนุมัติ", "အတည်ပြု")}</button>
              <button className="btn-ghost sm" onClick={() => decide(x, "rejected")}>{L("ไม่อนุมัติ", "ပယ်ချ")}</button></>}
            {x.status === "approved" && <><button className="btn-primary sm" onClick={() => setPayFor(x)}><UIcon name="purchase" size={14} color="#fff" /> {Number(x.paid_amount) > 0 ? L("จ่ายงวดต่อไป", "နောက်အရစ် ပေးချေ") : L("จ่ายเงิน + แนบสลิปโอน", "ငွေပေး + လွှဲဆလစ် တွဲ")}</button>
              {!(Number(x.paid_amount) > 0) && (salaryPeriod(x)
                ? <button className="btn-ghost sm danger" title={L("ยกเลิกใบเบิกเงินเดือนทั้งรอบ + เปิดรอบให้ทำเงินเดือนใหม่", "လစာ တောင်းခံလွှာ တစ်ကာလလုံး ပယ်ဖျက် + ကာလ ပြန်ဖွင့်")} onClick={() => reopenPayroll(x)}>↩️ {L("ยกเลิก + เปิดรอบเงินเดือนใหม่", "ပယ်ဖျက် + လစာကာလ ပြန်ဖွင့်")}</button>
                : <button className="btn-ghost sm danger" onClick={() => decide(x, "pending")}>{L("ยกเลิกอนุมัติ", "အတည်ပြုမှု ပယ်ဖျက်")}</button>)}</>}
            {x.status === "rejected" && !(Number(x.paid_amount) > 0) && <button className="btn-primary sm ok" title={L("นำรายการกลับมาจ่าย/อนุมัติใหม่", "ပြန်ယူ၍ ပေးချေ/အတည်ပြု")} onClick={() => restore(x)}>↩️ {L("นำกลับมา", "ပြန်ယူ")}{salaryPeriod(x) ? L(" (รอจ่าย)", "") : ""}</button>}
            {needReceipt(x) && <button className="btn-ghost sm" onClick={() => setRcptFor(x)}>📎 {L("แนบใบเสร็จแทนพนักงาน", "ဝန်ထမ်းကိုယ်စား ဘောက်ချာ တွဲ")}</button>}
            {/* ยกเลิกการจ่าย — ผู้บริหารเท่านั้น (เจ้าของเคาะ) */}
            {(x.status === "paid" || Number(x.paid_amount) > 0) && role === "exec" && <button className="btn-ghost sm danger" onClick={() => unpay(x)}>↩️ {L("ยกเลิกการจ่าย", "ငွေပေးမှု ပယ်ဖျက်")}</button>}
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
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [pos, setPos] = React.useState(null);
  const [sup, setSup] = React.useState("");
  const [sel, setSel] = React.useState({});
  const [q2, setQ2] = React.useState("");   // กรองในรายการ PO: เลขใบ / ลูกค้า / ใบเสนอ
  const [topQ, setTopQ] = React.useState("");   // ค้นหาบนสุด: ผู้ขาย / ผู้เบิก / เลขใบ
  const [mode, setMode] = React.useState("po");   // po = ใบสั่งซื้อ · exp = เบิกทั่วไป
  const [exps, setExps] = React.useState(null);   // เบิกทั่วไป (อนุมัติ · รอจ่าย · ไม่ใช่ PO)
  const [expReq, setExpReq] = React.useState("");   // ผู้เบิกที่เลือก (โหมดเบิกทั่วไป)
  const [accounts, setAccounts] = React.useState([]); const [payAcct, setPayAcct] = React.useState(""); const [proof, setProof] = React.useState([]);
  const expRem = (e) => Math.round(((Number(e.amount) || 0) - (Number(e.paid_amount) || 0)) * 100) / 100;
  const switchMode = (m) => { setMode(m); setSel({}); setSup(""); setExpReq(""); setTopQ(""); };
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    // ค้างจ่าย = ยังไม่จ่ายเงินจริง: ทั้งใบที่ยังไม่ตั้งเบิก และใบที่ตั้งเบิกรายใบค้างอยู่ (ใบเบิกยังไม่จ่ายสักบาท → ยุบรวมได้)
    Promise.all([listPurchaseOrders(), listExpenses().catch(() => []), listAccounts().catch(() => [])])
      .then(([p, ex, acc]) => {
        const exById = Object.fromEntries((ex || []).map((e) => [e.id, e]));
        setPos(p.filter((x) => {
          if (x.status === "cancelled" || !(x.total > 0) || x.paymentStatus === "paid") return false;
          if (!x.expense_id) return true;
          const e = exById[x.expense_id];
          if (!e) return true;   // ใบเบิกเดิมถูกลบไปแล้ว — ถือว่ายังไม่ตั้งเบิก
          return (e.status === "pending" || e.status === "approved") && !(Number(e.paid_amount) > 0);
        }));
        setAccounts(acc || []); setPayAcct((acc || [])[0]?.id || "");
        // เบิกทั่วไป = อนุมัติแล้ว · ยังจ่ายไม่ครบ · ไม่ใช่ใบที่ผูก PO (PO มีโหมดของตัวเอง)
        const poExpIds = new Set(p.filter((x) => x.expense_id).map((x) => x.expense_id));
        setExps((ex || []).filter((e) => e.status === "approved" && !poExpIds.has(e.id) && ((Number(e.amount) || 0) - (Number(e.paid_amount) || 0)) > 0.005));
      })
      .catch((e) => { flash(L("โหลดใบสั่งซื้อไม่สำเร็จ: ", "ဝယ်ယူလွှာ ဖွင့်မရ: ") + (e.message || e), true); setPos([]); });
  }, []);
  const supName = (x) => x.supplier?.trim() || L("(ไม่ระบุผู้ขาย)", "(ရောင်းသူ မသတ်မှတ်)");
  // ค้นหาบนสุด: ชื่อผู้ขาย / ผู้เบิก(ผู้สร้างใบ) / เลขใบ / ลูกค้า → กรอง dropdown ผู้ขาย + รายการ
  const posF = React.useMemo(() => (pos || []).filter((x) => !topQ.trim() || matchText(topQ, supName(x), x.createdByName, x.po_no, x.customerName, x.jobNo, x.teamName)), [pos, topQ]);
  const sups = React.useMemo(() => {
    const m = {};
    posF.forEach((x) => { const s = m[supName(x)] || (m[supName(x)] = { n: 0, sum: 0 }); s.n += 1; s.sum += Number(x.total) || 0; });
    return Object.entries(m).sort((a, b) => b[1].sum - a[1].sum);
  }, [posF]);
  // พิมพ์ค้นหาแล้วเหลือผู้ขายเดียว → เลือกให้เลย
  React.useEffect(() => { if (topQ.trim() && sups.length === 1 && sups[0][0] !== sup) { setSup(sups[0][0]); setSel({}); } }, [topQ, sups]);
  const list = posF.filter((x) => supName(x) === sup
    && matchText(q2, x.po_no, x.quote_no, x.customerName, x.jobNo, x.teamName, x.note, x.internal_note, x.createdByName));
  const chosen = list.filter((x) => sel[x.po_no]);
  const total = chosen.reduce((a, x) => a + (Number(x.total) || 0), 0);
  const allOn = list.length > 0 && chosen.length === list.length;
  // ── โหมดเบิกทั่วไป: จัดกลุ่มตามผู้เบิก + เลือกหลายใบ จ่ายทีเดียว ──
  const noReq = L("(ไม่ระบุผู้เบิก)", "(တောင်းသူ မသတ်မှတ်)");
  const expF = (exps || []).filter((e) => !topQ.trim() || matchText(topQ, e.requesterName, e.title, e.category, e.job_no));
  const reqs = (() => { const m = {}; expF.forEach((e) => { const k = e.requesterName || noReq; const s = m[k] || (m[k] = { n: 0, sum: 0 }); s.n++; s.sum += expRem(e); }); return Object.entries(m).sort((a, b) => b[1].sum - a[1].sum); })();
  const expList = expF.filter((e) => (e.requesterName || noReq) === expReq && matchText(q2, e.title, e.category, e.job_no, e.note));
  const expChosen = expList.filter((e) => sel[e.id]);
  const expTotal = expChosen.reduce((a, e) => a + expRem(e), 0);
  const expAllOn = expList.length > 0 && expChosen.length === expList.length;
  React.useEffect(() => { if (mode === "exp" && topQ.trim() && reqs.length === 1 && reqs[0][0] !== expReq) { setExpReq(reqs[0][0]); setSel({}); } }, [topQ, mode]);
  async function doBatchExp() {
    if (!expChosen.length) return;
    if (!await confirmDialog({ title: L(`ตั้งเบิกจ่ายรวม ${expChosen.length} ใบ?`, `တောင်းခံ ${expChosen.length} စောင် ပေါင်းစည်းမလား?`), message: L(`รวม ${fmtBaht(expTotal)} · ${expReq}\nระบบจะรวมเป็นใบขอจ่ายใบเดียว → เข้าคิวรออนุมัติ → อนุมัติแล้วค่อยจ่าย (เหมือน PO)\nใบเบิกเดิม ${expChosen.length} ใบจะถูกยุบรวม (ปิดใบเก่าอัตโนมัติ)`, `စုစုပေါင်း ${fmtBaht(expTotal)}`), confirmText: L("ตั้งเบิกจ่าย", "တောင်းခံ ဖွင့်"), danger: false })) return;
    setBusy(true);
    try { await requestExpensePaymentBatch(expChosen.map((e) => e.id), expReq); flash(L(`ตั้งเบิกจ่ายรวม ${expChosen.length} ใบ · ${fmtBaht(expTotal)} แล้ว — รออนุมัติ ✓`, `ပေါင်းစည်း တောင်းခံ ${expChosen.length} စောင် ဖွင့်ပြီး`)); onDone(); }
    catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
    setBusy(false);
  }
  async function save() {
    if (!chosen.length) return;
    const merges = chosen.filter((x) => x.expense_id).length;
    if (!await confirmDialog({ title: L(`ตั้งเบิกจ่ายเจ้าหนี้ ${sup}?`, `မြီရှင် ${sup} ကို တောင်းခံ ဖွင့်မလား?`), message: L(`รวม ${chosen.length} ใบ · ${fmtBaht(total)}${merges ? `\nใบเบิกรายใบเดิม ${merges} ใบจะถูกยุบรวมเข้าใบใหม่ (ปิดใบเก่าอัตโนมัติ)` : ""}\nอนุมัติ + จ่ายครบแล้ว ทุกใบจะขึ้น "จ่ายแล้ว" พร้อมกัน`, `စုစုပေါင်း ${chosen.length} စောင် · ${fmtBaht(total)}${merges ? `\nယခင် တစ်စောင်ချင်း တောင်းခံလွှာ ${merges} စောင်ကို လွှာအသစ်ထဲ ပေါင်းစည်းမည် (လွှာဟောင်း အလိုအလျောက် ပိတ်)` : ""}\nအတည်ပြု + ငွေအပြည့် ပေးပြီးလျှင် လွှာအားလုံး "ပေးပြီး" တစ်ပြိုင်နက် ဖြစ်မည်`), confirmText: L("ตั้งเบิกจ่าย", "တောင်းခံ ဖွင့်"), danger: false })) return;
    setBusy(true);
    try { await requestPoPaymentBatch(chosen); flash(L(`ตั้งเบิกจ่ายเจ้าหนี้ ${chosen.length} ใบ · ${fmtBaht(total)} แล้ว — รออนุมัติ ✓`, `မြီရှင် တောင်းခံ ${chosen.length} စောင် · ${fmtBaht(total)} ဖွင့်ပြီး — အတည်ပြုရန် စောင့် ✓`)); onDone(); }
    catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: "94vw" }}>
        <div className="modal-head"><div className="modal-title">🏭 {L("จ่ายเจ้าหนี้หลายใบในคราวเดียว", "မြီရှင် များစွာ တစ်ကြိမ်တည်း ပေးချေ")}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="view-seg" style={{ marginBottom: 10 }}>
            <button className={"seg-btn" + (mode === "po" ? " on" : "")} onClick={() => switchMode("po")}>🏭 {L("ใบสั่งซื้อ (PO)", "ဝယ်ယူလွှာ")}</button>
            <button className={"seg-btn" + (mode === "exp" ? " on" : "")} onClick={() => switchMode("exp")}>⛽ {L("เบิกทั่วไป", "အထွေထွေ တောင်းခံ")}{exps ? ` (${exps.length})` : ""}</button>
          </div>
          <div className="jo-dim" style={{ marginBottom: 10 }}>{mode === "po"
            ? L("เลือกผู้ขาย → ติ๊กใบสั่งซื้อที่ค้างจ่าย → ตั้งเบิกจ่ายให้เป็นใบเดียว", "ရောင်းသူ ရွေး → ငွေပေးရန်ကျန် ဝယ်ယူလွှာ ရွေး → တစ်စောင်တည်း တောင်းခံ")
            : L("เลือกผู้เบิก → ติ๊กใบเบิกที่รอจ่าย → รวมเป็นใบขอจ่ายใบเดียว เข้าคิวรออนุมัติ (จ่ายที่ขั้นอนุมัติ เหมือน PO)", "တောင်းသူ ရွေး → ရွေး → တစ်စောင်တည်း ပေါင်း၍ အတည်ပြုရန် (PO ကဲ့သို့)")}</div>
          {mode === "po" && (
          <>{pos === null ? <div className="empty">{L("กำลังโหลดใบสั่งซื้อ…", "ဝယ်ယူလွှာ ဖွင့်နေသည်…")}</div>
            : pos.length === 0 ? <div className="empty">🎉 {L("ไม่มีใบสั่งซื้อค้างจ่าย", "ငွေပေးရန်ကျန် ဝယ်ယူလွှာ မရှိပါ")}<br /><small style={{ color: "var(--ink-3)" }}>{L("(ใบที่จ่ายเงินไปแล้วบางส่วน จะไม่แสดงที่นี่ — จ่ายต่อที่ใบเบิกเดิม)", "(တစ်စိတ်တစ်ပိုင်း ငွေပေးပြီးသော လွှာများ ဤနေရာတွင် မပြ — ယခင် တောင်းခံလွှာတွင် ဆက်ပေးပါ)")}</small></div>
            : (<>
          <div className="cat-search" style={{ marginBottom: 8 }}>
            <UIcon name="search" size={15} color="var(--ink-3)" />
            <input placeholder={L("ค้นหา ผู้ขาย / ผู้เบิก / เลขใบ", "ရှာဖွေ ရောင်းသူ / တောင်းသူ / လွှာနံပါတ်")} value={topQ} onChange={(e) => setTopQ(e.target.value)} />
          </div>
          <label className="fld"><span>{L("ผู้ขาย / เจ้าหนี้", "ရောင်းသူ / မြီရှင်")}</span>
            <select className="inp" value={sup} onChange={(e) => { setSup(e.target.value); setSel({}); }}>
              <option value="">{sups.length ? L("— เลือกผู้ขาย —", "— ရောင်းသူ ရွေး —") : L("— ไม่พบผู้ขายที่ตรงคำค้นหา —", "— ရှာဖွေမှု မတွေ့ —")}</option>
              {sups.map(([name, s]) => <option key={name} value={name}>{name} · {L(`ค้าง ${s.n} ใบ`, `ကျန် ${s.n} စောင်`)} ({fmtBaht(s.sum)})</option>)}
            </select></label>
          {sup && (
            <>
            <div className="cat-search" style={{ marginTop: 8 }}>
              <UIcon name="search" size={15} color="var(--ink-3)" />
              <input value={q2} onChange={(e) => setQ2(e.target.value)} placeholder={L("กรองในรายการ: เลข PO / ลูกค้า / ใบเสนอ / ทีมช่าง…", "စာရင်းတွင် စစ်ထုတ်: PO နံပါတ် / ဖောက်သည် / စျေးနှုန်းလွှာ / အဖွဲ့…")} />
              {q2 && <button className="cat-search-x" onClick={() => setQ2("")}><UIcon name="x" size={14} /></button>}
            </div>
            <div style={{ border: "1px solid var(--line)", borderRadius: 11, marginTop: 8, overflow: "hidden" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--line-2)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? {} : Object.fromEntries(list.map((x) => [x.po_no, true])))} />
                {L(`เลือกทั้งหมดที่แสดง (${list.length} ใบ)`, `ပြထားသမျှ အားလုံး ရွေး (${list.length} စောင်)`)}
              </label>
              {list.length === 0 && <div className="empty sm" style={{ padding: 14 }}>{L("ไม่พบใบสั่งซื้อที่ตรงคำค้น", "ရှာဖွေမှုနှင့် ကိုက်ညီသော ဝယ်ယူလွှာ မတွေ့ပါ")}</div>}
              {list.map((x) => (
                <label key={x.po_no} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderBottom: "1px solid var(--line-2)", cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={!!sel[x.po_no]} onChange={() => setSel((s) => ({ ...s, [x.po_no]: !s[x.po_no] }))} />
                  <b style={{ fontFamily: "var(--mono)" }}>{x.po_no}</b>
                  <span className={"job-badge " + (x.status === "received" ? "b-green" : "b-amber")}>{x.status === "received" ? L("รับของแล้ว", "ပစ္စည်း လက်ခံပြီး") : L("รอรับของ", "ပစ္စည်း လက်ခံရန် စောင့်")}</span>
                  {x.expense_id && <span className="job-badge b-blue" title={L("ใบนี้ตั้งเบิกรายใบไว้แล้ว (ยังไม่จ่ายเงิน) — เลือกแล้วระบบจะปิดใบเบิกเดิม ยุบรวมเข้าใบใหม่ให้", "ဤလွှာကို တစ်စောင်ချင်း တောင်းခံ ဖွင့်ပြီး (ငွေမပေးရသေး) — ရွေးလျှင် စနစ်က ယခင်လွှာကို ပိတ်၍ လွှာအသစ်ထဲ ပေါင်းစည်းပေးမည်")}>{L("ตั้งเบิกไว้แล้ว · ยุบรวมได้", "တောင်းခံ ဖွင့်ပြီး · ပေါင်းစည်းနိုင်")}</span>}
                  <span className="jo-dim" style={{ flex: 1 }}>{fmtD(x.issue_date || x.created_at)}{x.customerName ? ` · 👤 ${x.customerName}` : ""}{x.quote_no ? L(` · อ้างอิง ${x.quote_no}`, ` · ကိုးကား ${x.quote_no}`) : ""}</span>
                  <b>{fmtBaht(x.total)}</b>
                </label>
              ))}
            </div>
            </>
          )}
            </>)}
          </>)}
          {mode === "exp" && (
          <>{exps === null ? <div className="empty">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div>
            : exps.length === 0 ? <div className="empty">🎉 {L("ไม่มีเบิกทั่วไปรอจ่าย", "ပေးရန်ကျန် အထွေထွေ တောင်းခံ မရှိ")}</div>
            : (<>
          <div className="cat-search" style={{ marginBottom: 8 }}>
            <UIcon name="search" size={15} color="var(--ink-3)" />
            <input placeholder={L("ค้นหา ผู้เบิก / รายการ", "ရှာဖွေ တောင်းသူ / အကြောင်းအရာ")} value={topQ} onChange={(e) => setTopQ(e.target.value)} />
          </div>
          <label className="fld"><span>{L("ผู้เบิก", "တောင်းသူ")}</span>
            <select className="inp" value={expReq} onChange={(e) => { setExpReq(e.target.value); setSel({}); }}>
              <option value="">{reqs.length ? L("— เลือกผู้เบิก —", "— တောင်းသူ ရွေး —") : L("— ไม่พบผู้เบิกที่ตรงคำค้นหา —", "— မတွေ့ —")}</option>
              {reqs.map(([name, s]) => <option key={name} value={name}>{name} · {L(`${s.n} ใบ`, `${s.n} စောင်`)} ({fmtBaht(s.sum)})</option>)}
            </select></label>
          {expReq && (<>
            <div style={{ border: "1px solid var(--line)", borderRadius: 11, marginTop: 8, overflow: "hidden" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--line-2)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>
                <input type="checkbox" checked={expAllOn} onChange={() => setSel(expAllOn ? {} : Object.fromEntries(expList.map((e) => [e.id, true])))} />
                {L(`เลือกทั้งหมด (${expList.length} ใบ)`, `အားလုံး ရွေး (${expList.length})`)}
              </label>
              {expList.map((e) => (
                <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 12px", borderBottom: "1px solid var(--line-2)", cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={!!sel[e.id]} onChange={() => setSel((s) => ({ ...s, [e.id]: !s[e.id] }))} />
                  <b style={{ flex: 1 }}>{e.title || e.category || L("เบิกจ่าย", "တောင်းခံ")}</b>
                  <span className="jo-dim">{fmtD(e.created_at)}{e.job_no ? ` · ${e.job_no}` : ""}</span>
                  <b>{fmtBaht(expRem(e))}</b>
                </label>
              ))}
            </div>
          </>)}
            </>)}
          </>)}
        </div>
        <div className="modal-foot">
          {mode === "po" ? <>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: chosen.length ? "var(--ink)" : "var(--ink-3)" }}>{chosen.length ? L(`เลือก ${chosen.length} ใบ · รวม ${fmtBaht(total)}`, `ရွေးထား ${chosen.length} စောင် · စုစုပေါင်း ${fmtBaht(total)}`) : L("ยังไม่ได้เลือกใบสั่งซื้อ", "ဝယ်ယူလွှာ မရွေးရသေး")}</span>
          <button className="btn-ghost" onClick={onClose}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>
          <button className="btn-primary" disabled={busy || !chosen.length} onClick={save}>{L("ตั้งเบิกจ่าย", "တောင်းခံ ဖွင့်")} {chosen.length > 0 ? L(`${chosen.length} ใบ`, `${chosen.length} စောင်`) : ""}</button>
          </> : <>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: expChosen.length ? "var(--ink)" : "var(--ink-3)" }}>{expChosen.length ? L(`เลือก ${expChosen.length} ใบ · รวม ${fmtBaht(expTotal)}`, `ရွေးထား ${expChosen.length} · ${fmtBaht(expTotal)}`) : L("ยังไม่ได้เลือกใบเบิก", "မရွေးရသေး")}</span>
          <button className="btn-ghost" onClick={onClose}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>
          <button className="btn-primary" disabled={busy || !expChosen.length} onClick={doBatchExp}>{L("ตั้งเบิกจ่าย", "တောင်းခံ ဖွင့်")} {expChosen.length > 0 ? L(`${expChosen.length} ใบ`, `${expChosen.length}`) : ""}</button>
          </>}
        </div>
      </div>
    </div>
  );
}

function PayModal({ x, onClose, onPaid, flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
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
    if (!accountId) return flash(L("เลือกบัญชีที่จ่าย", "ငွေပေးမည့် အကောင့် ရွေးပါ"), true);
    if (!payDate) return flash(L("เลือกวันที่จ่าย", "ငွေပေးရက် ရွေးပါ"), true);
    if (mode === "partial") { if (payAmt <= 0) return flash(L("ใส่จำนวนเงินที่จ่ายงวดนี้", "ဤအရစ် ပေးမည့် ပမာဏ ဖြည့်ပါ"), true); if (payAmt > remaining + 0.005) return flash(L("จ่ายเกินยอดคงเหลือ", "ကျန်ငွေထက် ကျော်၍ ပေးနေသည်"), true); }
    setBusy(true);
    try {
      await payExpense(x.id, { accountId, proof, payDate, amount: mode === "full" ? undefined : payAmt, expectedPayDate: leaves ? (expDate || null) : undefined });
      flash(payAmt >= remaining - 0.005 ? L("จ่ายครบแล้ว + แจ้งผู้ขอเบิก ✓", "အပြည့် ပေးပြီး + တောင်းခံသူ အသိပေးပြီး ✓") : L("จ่ายบางส่วนแล้ว ✓ (ตั้งประมาณการยอดค้างในกระแสเงินสด)", "တစ်စိတ်တစ်ပိုင်း ပေးပြီး ✓ (ကျန်ငွေ ခန့်မှန်းချက်ကို ငွေသားစီးဆင်းမှုတွင် သတ်မှတ်)")); onPaid();
    } catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">{L("จ่ายเงินเบิก · ยอดคงเหลือ ", "တောင်းခံငွေ ပေးချေ · ကျန်ငွေ ")}{fmtBaht(remaining)}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="jo-dim" style={{ marginBottom: 10 }}>{x.title}{(x.jobNo || x.job_no) ? L(` · งาน ${x.jobNo || x.job_no}`, ` · အလုပ် ${x.jobNo || x.job_no}`) : ""}{x.customerName ? L(` · ลูกค้า ${x.customerName}`, ` · ဖောက်သည် ${x.customerName}`) : ""} · {L(`ยอดเบิกรวม ${fmtBaht(total)}`, `တောင်းခံ စုစုပေါင်း ${fmtBaht(total)}`)}{already > 0 ? L(` · จ่ายแล้ว ${fmtBaht(already)}`, ` · ပေးပြီး ${fmtBaht(already)}`) : ""}</div>
          <div className="fld"><span>{L("จำนวนที่จ่ายงวดนี้", "ဤအရစ် ပေးမည့် ပမာဏ")}</span>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <button type="button" className={"cat-chip" + (mode === "full" ? " on" : "")} style={mode === "full" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}} onClick={() => setMode("full")}>{L(`จ่ายทั้งหมด (${fmtBaht(remaining)})`, `အားလုံး ပေး (${fmtBaht(remaining)})`)}</button>
              <button type="button" className={"cat-chip" + (mode === "partial" ? " on" : "")} style={mode === "partial" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}} onClick={() => setMode("partial")}>{L("แบ่งจ่าย", "အရစ်ကျ ပေး")}</button>
            </div>
            {mode === "partial" && <div className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" max={remaining} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={L(`ไม่เกิน ${remaining}`, `${remaining} မကျော်ရ`)} /></div>}
            {leaves && <div className="jo-dim" style={{ marginTop: 4, color: "#d97706" }}>{L(`จ่ายงวดนี้ ${fmtBaht(payAmt)} · เหลือค้าง ${fmtBaht(remaining - payAmt)}`, `ဤအရစ် ပေး ${fmtBaht(payAmt)} · ကျန် ${fmtBaht(remaining - payAmt)}`)}</div>}
          </div>
          {leaves && <label className="fld"><span>📅 {L("วันคาดว่าจะจ่ายยอดที่เหลือ (ประมาณการในกระแสเงินสด · แก้ไขได้ภายหลัง)", "ကျန်ငွေ ပေးမည့် ခန့်မှန်းရက် (ငွေသားစီးဆင်းမှုတွင် ခန့်မှန်း · နောက်မှ ပြင်ဆင်နိုင်)")}</span>
            <input type="date" className="inp" value={expDate} onChange={(e) => setExpDate(e.target.value)} /></label>}
          <div className="fld-row">
            <label className="fld"><span>{L("จ่ายจากบัญชี", "ငွေပေးမည့် အကောင့်")}</span>
              <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({L("คงเหลือ", "ကျန်ငွေ")} {fmtBaht(a.balance)})</option>)}
              </select></label>
            <label className="fld"><span>{L("วันที่จ่าย", "ငွေပေးရက်")}</span><input type="date" className="inp" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>
          </div>
          <div className="fld"><span>💸 {L("แนบสลิปโอนเงิน (หลักฐานการจ่าย)", "ငွေလွှဲ ဆလစ် တွဲ (ငွေပေး အထောက်အထား)")}</span><AttachRow files={proof} onChange={setProof} flash={flash} label={L("แนบสลิปโอนเงิน", "ငွေလွှဲ ဆလစ် တွဲ")} /></div>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>
          <button className="btn-primary" disabled={busy} onClick={pay}>{L("ยืนยันจ่าย ", "ပေးရန် အတည်ပြု ")}{fmtBaht(payAmt)}</button></div>
      </div>
    </div>
  );
}

function AccountsTab({ flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
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
    } catch (e) { flash(L("โหลดไม่สำเร็จ: ", "ဖွင့်မရ: ") + (e.message || e), true); }
  }
  React.useEffect(() => { load(); }, []);
  async function transfer() {
    if (!(Number(t.amount) > 0)) return flash(L("ใส่จำนวนเงิน", "ပမာဏ ဖြည့်ပါ"), true);
    if (!await confirmDialog(L(`โอน ${fmtBaht(t.amount)} ระหว่างบัญชี?`, `အကောင့်ချင်း ${fmtBaht(t.amount)} လွှဲမလား?`))) return;
    setBusy(true);
    try { await transferFunds(t); flash(L("โอนเงินแล้ว ✓", "ငွေလွှဲပြီး ✓")); setT((s) => ({ ...s, amount: "", note: "" })); load(); }  // keep date for consecutive transfers
    catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
    setBusy(false);
  }
  async function delTransfer(tr) {
    if (!await confirmDialog(L(`ลบรายการโอน ${fmtBaht(tr.amount)} (${accName[tr.fromId] || "?"} → ${accName[tr.toId] || "?"}) ?`, `ငွေလွှဲ ${fmtBaht(tr.amount)} (${accName[tr.fromId] || "?"} → ${accName[tr.toId] || "?"}) ကို ဖျက်မလား?`))) return;
    try { await deleteTransfer(tr.ref_id); flash(L("ลบรายการโอนแล้ว", "ငွေလွှဲ စာရင်း ဖျက်ပြီး")); load(); }
    catch (e) { flash(L("ลบไม่สำเร็จ: ", "ဖျက်၍ မအောင်မြင်: ") + (e.message || e), true); }
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
        <div className="sec-head"><div><div className="sec-title">{L("โอนเงินระหว่างบัญชี", "အကောင့်ချင်း ငွေလွှဲ")}</div></div></div>
        <div className="fld-row">
          <label className="fld"><span>{L("จากบัญชี", "မှ အကောင့်")}</span><select className="inp" value={t.fromId} onChange={(e) => setT({ ...t, fromId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="fld"><span>{L("ไปบัญชี", "သို့ အကောင့်")}</span><select className="inp" value={t.toId} onChange={(e) => setT({ ...t, toId: e.target.value })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        </div>
        <div className="fld-row">
          <label className="fld"><span>{L("วันที่โอน", "ငွေလွှဲရက်")}</span><input type="date" className="inp" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} /></label>
          <label className="fld"><span>{L("จำนวนเงิน", "ပမာဏ")}</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={t.amount} onChange={(e) => setT({ ...t, amount: e.target.value })} /></span></label>
        </div>
        <label className="fld"><span>{L("หมายเหตุ", "မှတ်ချက်")}</span><input className="inp" value={t.note} onChange={(e) => setT({ ...t, note: e.target.value })} placeholder={L("(ไม่บังคับ)", "(မဖြစ်မနေ မဟုတ်)")} /></label>
        <button className="btn-primary" disabled={busy} onClick={transfer}><UIcon name="trend" size={15} color="#fff" /> {L("โอนเงิน", "ငွေလွှဲ")}</button>
      </div>

      <div className="card">
        <div className="sec-head"><div><div className="sec-title">{L("ประวัติการโอน", "ငွေလွှဲ မှတ်တမ်း")}</div><div className="sec-sub">{L("แก้ไข/ลบได้ เผื่อบันทึกผิด (มีผลกับยอดทั้ง 2 บัญชีทันที)", "မှားမှတ်မိလျှင် ပြင်/ဖျက်နိုင် (အကောင့် ၂ ခုလုံး၏ လက်ကျန်ကို ချက်ချင်း သက်ရောက်)")}</div></div></div>
        {transfers === null && <div className="empty sm">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</div>}
        {transfers && transfers.length === 0 && <div className="empty sm">{L("ยังไม่มีรายการโอน", "ငွေလွှဲ စာရင်း မရှိသေးပါ")}</div>}
        {transfers && transfers.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="hr-table">
              <thead><tr><th style={{ textAlign: "left" }}>{L("วันที่", "ရက်စွဲ")}</th><th style={{ textAlign: "left" }}>{L("จาก → ไป", "မှ → သို့")}</th><th style={{ textAlign: "left" }}>{L("หมายเหตุ", "မှတ်ချက်")}</th><th>{L("จำนวน", "ပမာဏ")}</th><th style={{ width: 90 }}></th></tr></thead>
              <tbody>
                {transfers.map((tr) => (
                  <tr key={tr.ref_id}>
                    <td style={{ textAlign: "left" }}>{fmtD(tr.entry_date)}</td>
                    <td style={{ textAlign: "left" }}>{accName[tr.fromId] || "?"} <span style={{ color: "var(--ink-3)" }}>→</span> {accName[tr.toId] || "?"}</td>
                    <td style={{ textAlign: "left", color: "var(--ink-3)" }}>{tr.note || "-"}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtBaht(tr.amount)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn-ghost sm" title={L("แก้ไข", "ပြင်ဆင်")} onClick={() => setEdit({ ...tr, amount: String(tr.amount) })} style={{ padding: "2px 7px" }}><UIcon name="edit" size={13} /></button>
                      <button className="btn-ghost sm" title={L("ลบ", "ဖျက်")} onClick={() => delTransfer(tr)} style={{ padding: "2px 7px", marginLeft: 4 }}><UIcon name="x" size={13} /></button>
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
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [f, setF] = React.useState({ fromId: tr.fromId, toId: tr.toId, amount: tr.amount, note: tr.note || "", entry_date: tr.entry_date || today() });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (f.fromId === f.toId) return flash(L("บัญชีต้นทาง/ปลายทางต้องต่างกัน", "မှ/သို့ အကောင့် မတူရ"), true);
    if (!(Number(f.amount) > 0)) return flash(L("ใส่จำนวนเงิน", "ပမာဏ ဖြည့်ပါ"), true);
    setBusy(true);
    try { await updateTransfer(tr.ref_id, f); flash(L("แก้ไขรายการโอนแล้ว ✓", "ငွေလွှဲ စာရင်း ပြင်ဆင်ပြီး ✓")); onSaved(); }
    catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <div className="modal-head"><div className="modal-title">{L("แก้ไขรายการโอน", "ငွေလွှဲ စာရင်း ပြင်ဆင်")}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>{L("จากบัญชี", "မှ အကောင့်")}</span><select className="inp" value={f.fromId} onChange={(e) => set("fromId", e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label className="fld"><span>{L("ไปบัญชี", "သို့ အကောင့်")}</span><select className="inp" value={f.toId} onChange={(e) => set("toId", e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          </div>
          <div className="fld-row">
            <label className="fld"><span>{L("วันที่", "ရက်စွဲ")}</span><input type="date" className="inp" value={f.entry_date} onChange={(e) => set("entry_date", e.target.value)} /></label>
            <label className="fld"><span>{L("จำนวนเงิน", "ပမာဏ")}</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></span></label>
          </div>
          <label className="fld"><span>{L("หมายเหตุ", "မှတ်ချက်")}</span><input className="inp" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder={L("(ไม่บังคับ)", "(မဖြစ်မနေ မဟုတ်)")} /></label>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{L("บันทึกการแก้ไข", "ပြင်ဆင်ချက် သိမ်း")}</button></div>
      </div>
    </div>
  );
}

const KIND_TAG = { transfer: "🔁 โอน", expense: "🧾 เบิกจ่าย", receipt: "💰 รับเงินลูกค้า", payout: "🧑‍🔧 จ่ายช่างซัพ", opening: "⚑ ยอดยกมา", adjust: "⚙ ปรับปรุง", manual: "✍️ บันทึกเอง" };
const KIND_TAG_MY = { transfer: "🔁 လွှဲပြောင်း", expense: "🧾 ကုန်ကျစရိတ်", receipt: "💰 ဖောက်သည်ထံမှ ငွေ", payout: "🧑‍🔧 ကန်ထရိုက် ပေးချေ", opening: "⚑ လက်ကျန်ယူ", adjust: "⚙ ချိန်ညှိ", manual: "✍️ ကိုယ်တိုင် မှတ်တမ်း" };
const recErr = (e, my) => /reconciled|column|PGRST204/i.test(e?.message || "") ? (my ? "Supabase တွင် migration 089 (ဘဏ်တိုက်ဆိုင်) အရင် ဖွင့်ရန်" : "ยังไม่ได้รัน migration 089 (กระทบแบงค์) ใน Supabase ก่อน") : (my ? "မအောင်မြင်: " : "ไม่สำเร็จ: ") + (e?.message || e);
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const thMonth = (d) => d.toLocaleDateString("th-TH", { month: "long", year: "numeric" });

function ReportTab({ flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
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
    catch (e) { flash(L("โหลดไม่สำเร็จ: ", "ဖွင့်မရ: ") + (e.message || e), true); }
  }
  async function loadRows() {
    if (!accountId) return;
    try { setRows(await listAccountEntries(accountId !== "all" ? { accountId } : {})); }
    catch (e) { flash(L("โหลดไม่สำเร็จ: ", "ဖွင့်မရ: ") + (e.message || e), true); setRows([]); }
  }
  // on open: pull customer deposits from receipts, then load (so รับเงินลูกค้า appears without pressing sync)
  React.useEffect(() => { (async () => { try { await syncBankReceipts(); } catch (_) {} loadAccounts(); })(); }, []);
  React.useEffect(() => { loadRows(); }, [accountId]);
  const acc0 = accById[accountId];
  React.useEffect(() => { if (accountId && accountId !== "all") { setOpeningInput(String(Number(acc0?.opening_balance) || 0)); setOpeningLocked(true); } }, [accountId, acc0?.opening_balance]);
  const refresh = () => { loadAccounts(); loadRows(); };
  async function pullReceipts() {
    setBusy(true);
    try { const r = await syncBankReceipts(); flash(L(`ดึงจากใบเสร็จแล้ว · เพิ่ม ${r.added} · อัปเดต ${r.updated}${r.removed ? " · ลบ " + r.removed : ""} ✓`, `ဘောက်ချာမှ ဆွဲယူပြီး · ထည့် ${r.added} · အပ်ဒိတ် ${r.updated}${r.removed ? " · ဖျက် " + r.removed : ""} ✓`)); refresh(); }
    catch (e) { flash(recErr(e, lang === "my"), true); }
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
    if (!await confirmDialog(L("ปลดล็อกเพื่อแก้ 'ยอดยกมาตั้งต้น' ?\nยอดนี้กระทบยอดคงเหลือทุกเดือน แก้เมื่อจำเป็นเท่านั้น", "'စတင် လက်ကျန်ယူ' ကို ပြင်ရန် သော့ဖွင့်မလား?\nဤလက်ကျန်သည် လစဉ် လက်ကျန်ကို သက်ရောက်သည် · လိုအပ်မှသာ ပြင်ပါ"))) return;
    setOpeningLocked(false);
  }
  async function saveOpening() {
    if (!single) { setOpeningLocked(true); return; }
    const v = Number(openingInput) || 0;
    if (v === (Number(acc?.opening_balance) || 0)) { setOpeningLocked(true); return; }
    try { await setAccountOpening(accountId, v); flash(L("บันทึกยอดยกมาแล้ว ✓", "လက်ကျန်ယူ သိမ်းပြီး ✓")); loadAccounts(); }
    catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
    setOpeningLocked(true);
  }
  async function toggleRec(r) {
    setBusy(true);
    try { await setEntriesReconciled([r.id], !r.reconciled); setRows((rs) => rs.map((x) => x.id === r.id ? { ...x, reconciled: !r.reconciled } : x)); }
    catch (e) { flash(recErr(e, lang === "my"), true); }
    setBusy(false);
  }
  async function reconcileAllShown() {
    const ids = shown.filter((r) => !r.reconciled).map((r) => r.id);
    if (!ids.length) return flash(L("ไม่มีรายการที่ยังไม่กระทบในหน้านี้", "ဤစာမျက်နှာတွင် မတိုက်ဆိုင်ရသေးသော စာရင်း မရှိပါ"));
    if (!await confirmDialog(L(`ทำเครื่องหมาย "กระทบแล้ว" ให้ ${ids.length} รายการที่แสดง?`, `ပြထားသော စာရင်း ${ids.length} ခုကို "တိုက်ဆိုင်ပြီး" အမှတ်အသား ပြုမလား?`))) return;
    setBusy(true);
    try { await setEntriesReconciled(ids, true); setRows((rs) => rs.map((x) => ids.includes(x.id) ? { ...x, reconciled: true } : x)); flash(L(`กระทบ ${ids.length} รายการแล้ว ✓`, `စာရင်း ${ids.length} ခု တိုက်ဆိုင်ပြီး ✓`)); }
    catch (e) { flash(recErr(e, lang === "my"), true); }
    setBusy(false);
  }
  async function del(r) {
    if (!await confirmDialog(L(`ลบรายการ "${r.note || "-"}" (${fmtBaht(r.amount)}) ?`, `စာရင်း "${r.note || "-"}" (${fmtBaht(r.amount)}) ကို ဖျက်မလား?`))) return;
    try { await deleteAccountEntry(r.id); flash(L("ลบแล้ว", "ဖျက်ပြီး")); refresh(); }
    catch (e) { flash(L("ลบไม่สำเร็จ: ", "ဖျက်၍ မအောင်မြင်: ") + (e.message || e), true); }
  }

  return (
    <div className="card">
      <div className="sec-head"><div><div className="sec-title">{L("เดินบัญชี & กระทบแบงค์", "အကောင့်လှုပ်ရှား & ဘဏ်တိုက်ဆိုင်")}</div>
        <div className="sec-sub">{L("ดึงยอดรับเงินจากใบเสร็จอัตโนมัติ · ดูแยกรายเดือน (ยอดยกมา→คงเหลือ ยกไปเดือนถัดไปอัตโนมัติ) · ติ๊ก ✓ ที่ตรงกับ statement", "ဘောက်ချာမှ ငွေဝင် အလိုအလျောက် ဆွဲယူ · လစဉ်ခွဲ ကြည့် (လက်ကျန်ယူ→ကျန်ငွေ နောက်လသို့ အလိုအလျောက် ရွှေ့) · statement နှင့် ကိုက်သည်ကို ✓ ခြစ်")}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-ghost" disabled={busy} onClick={pullReceipts}><UIcon name="withdraw" size={15} /> {L("ดึงยอดรับเงินจากเอกสาร", "စာရွက်စာတမ်းမှ ငွေဝင် ဆွဲယူ")}</button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> {L("เพิ่มรายการ (ฝาก/ถอน)", "စာရင်း ထည့် (သွင်း/ထုတ်)")}</button>
        </div></div>

      <div className="cat-filter" style={{ marginTop: 4 }}>
        {[["all", L("ทุกบัญชี", "အကောင့်အားလုံး")], ...accounts.map((a) => [a.id, (a.kind === "cash" ? "💵 " : "🏦 ") + a.name])].map(([v, l]) => (
          <button key={v} className={"cat-chip" + (accountId === v ? " on" : "")} onClick={() => setAccountId(v)} style={accountId === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
        ))}
      </div>

      {single && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px 0 2px" }}>
            <button className="btn-ghost sm" disabled={allMonths} onClick={() => move(-1)}>◀</button>
            <b style={{ minWidth: 150, textAlign: "center", fontSize: 15 }}>{allMonths ? L("ทุกเดือน", "လအားလုံး") : thMonth(anchor)}</b>
            <button className="btn-ghost sm" disabled={allMonths} onClick={() => move(1)}>▶</button>
            <button className="btn-ghost sm" onClick={() => { setAllMonths(false); const d = new Date(); setAnchor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>{L("เดือนนี้", "ဤလ")}</button>
            <button className={"cat-chip" + (allMonths ? " on" : "")} onClick={() => setAllMonths((v) => !v)} style={allMonths ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{L("ทุกเดือน", "လအားလုံး")}</button>
            <label className="jo-dim" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>{L("ยอดยกมาตั้งต้น", "စတင် လက်ကျန်ယူ")}
              <span className="inp inp-unit" style={{ width: 150, opacity: openingLocked ? 0.65 : 1 }}><span className="unit-pre">฿</span>
                <input type="number" step="0.01" value={openingInput} disabled={openingLocked} onChange={(e) => setOpeningInput(e.target.value)} onBlur={saveOpening} title={L("ยอดก่อนรายการแรกสุด — เดือนถัด ๆ ไประบบยกยอดให้เอง", "ပထမဆုံး စာရင်းမတိုင်မီ လက်ကျန် — နောက်လများ စနစ်က အလိုအလျောက် လွှဲပေးမည်")} /></span>
              {openingLocked
                ? <button className="btn-ghost sm" onClick={unlockOpening} title={L("ปลดล็อกเพื่อแก้ยอดตั้งต้น", "စတင်လက်ကျန် ပြင်ရန် သော့ဖွင့်")}>🔒 {L("แก้", "ပြင်")}</button>
                : <button className="btn-ghost sm ok" onClick={saveOpening} title={L("บันทึก + ล็อก", "သိမ်း + သော့ခတ်")}>✓ {L("บันทึก", "သိမ်း")}</button>}
            </label>
          </div>
          <div className="exp-accounts" style={{ marginTop: 8 }}>
            <div className="exp-acc"><div className="exp-acc-name">{monthly ? L("ยอดยกมาต้นเดือน", "လဆန်း လက်ကျန်ယူ") : L("ยอดยกมาตั้งต้น", "စတင် လက်ကျန်ယူ")}</div><div className="exp-acc-bal">{fmtBaht(monthOpening)}</div></div>
            <div className="exp-acc"><div className="exp-acc-name">{L("เงินเข้า", "ငွေဝင်")}{monthly ? L("เดือนนี้", "ဤလ") : L("ทั้งหมด", "စုစုပေါင်း")}</div><div className="exp-acc-bal" style={{ color: "var(--up)" }}>{fmtBaht(scopeIn)}</div></div>
            <div className="exp-acc"><div className="exp-acc-name">{L("เงินออก", "ငွေထွက်")}{monthly ? L("เดือนนี้", "ဤလ") : L("ทั้งหมด", "စုစုပေါင်း")}</div><div className="exp-acc-bal" style={{ color: "var(--down)" }}>−{fmtBaht(scopeOut)}</div></div>
            <div className="exp-acc"><div className="exp-acc-name">{monthly ? L("ยอดคงเหลือสิ้นเดือน", "လကုန် ကျန်ငွေ") : L("ยอดคงเหลือ", "ကျန်ငွေ")}</div><div className="exp-acc-bal">{fmtBaht(closing)}</div>{monthly && <div className="jo-dim" style={{ marginTop: 2 }}>{L("ยกไปเดือนหน้าอัตโนมัติ", "နောက်လသို့ အလိုအလျောက် လွှဲ")}</div>}</div>
            <div className="exp-acc">
              <div className="exp-acc-name">{L("ยอดตาม statement ", "statement အရ လက်ကျန် ")}{monthly ? L("(สิ้นเดือน)", "(လကုန်)") : L("ธนาคาร", "ဘဏ်")}</div>
              <span className="inp inp-unit" style={{ marginTop: 6 }}><span className="unit-pre">฿</span><input type="number" step="0.01" value={stmt} onChange={(e) => setStmt(e.target.value)} placeholder={L("กรอกยอดจากธนาคาร", "ဘဏ်မှ လက်ကျန် ဖြည့်ပါ")} /></span>
              {diff != null && <div className="jo-dim" style={{ marginTop: 6, fontWeight: 700, color: diff === 0 ? "var(--up)" : "var(--down)" }}>{diff === 0 ? L("✓ ตรงกับยอดในระบบ", "✓ စနစ်လက်ကျန်နှင့် ကိုက်ညီ") : L(`ผลต่าง ${fmtBaht(diff)}`, `ကွာခြား ${fmtBaht(diff)}`)}</div>}
            </div>
          </div>
        </>
      )}

      <div className="cat-filter" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <label className="jo-dim" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={onlyUnrec} onChange={(e) => setOnlyUnrec(e.target.checked)} /> {L("แสดงเฉพาะที่ยังไม่กระทบ", "မတိုက်ဆိုင်ရသေးသည်သာ ပြ")}
          {single && <span style={{ marginLeft: 8 }}>· {L("กระทบแล้ว", "တိုက်ဆိုင်ပြီး")} {recCount}/{inScope.length}</span>}
        </label>
        <button className="btn-ghost sm" disabled={busy || !shown.some((r) => !r.reconciled)} onClick={reconcileAllShown}>✓ {L("กระทบทั้งหมดที่แสดง", "ပြထားသမျှ တိုက်ဆိုင်")}</button>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="hr-table">
          <thead><tr><th style={{ width: 44 }}>{L("กระทบ", "တိုက်ဆိုင်")}</th><th style={{ textAlign: "left" }}>{L("วันที่", "ရက်စွဲ")}</th>{!single && <th style={{ textAlign: "left" }}>{L("บัญชี", "အကောင့်")}</th>}<th style={{ textAlign: "left" }}>{L("รายการ", "စာရင်း")}</th><th>{L("เข้า", "ဝင်")}</th><th>{L("ออก", "ထွက်")}</th><th>{L("คงเหลือ", "ကျန်")}</th><th style={{ width: 44 }}></th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={single ? 7 : 8} className="empty sm">{L("กำลังโหลด…", "ဖွင့်နေသည်…")}</td></tr>}
            {rows && shown.length === 0 && <tr><td colSpan={single ? 7 : 8} className="empty sm">{monthly ? L("ไม่มีรายการในเดือนนี้", "ဤလတွင် စာရင်း မရှိပါ") : L("ไม่มีรายการ", "စာရင်း မရှိပါ")}</td></tr>}
            {shown.map((r) => (
              <tr key={r.id} style={r.reconciled ? { background: "var(--surface-2)" } : {}}>
                <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!r.reconciled} disabled={busy} onChange={() => toggleRec(r)} title={L("กระทบกับ statement แล้ว", "statement နှင့် တိုက်ဆိုင်ပြီး")} /></td>
                <td style={{ textAlign: "left" }}>{fmtD(r.entry_date)}</td>
                {!single && <td style={{ textAlign: "left" }}>{accById[r.account_id]?.name || "-"}</td>}
                <td style={{ textAlign: "left" }}>{r.note || "-"}{r.category && <span className="jo-dim" style={{ marginLeft: 6, background: "var(--surface-2)", border: "1px solid var(--line-2)", borderRadius: 6, padding: "1px 6px" }}>{r.category}</span>}<span className="jo-dim" style={{ marginLeft: 6 }}>{(lang === "my" ? KIND_TAG_MY[r.kind] : KIND_TAG[r.kind]) || ""}</span></td>
                <td className="hr-ok">{r.direction === "in" ? fmtBaht(r.amount) : "—"}</td>
                <td className="hr-bad">{r.direction === "out" ? fmtBaht(r.amount) : "—"}</td>
                <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{runBal[r.id] != null ? fmtBaht(runBal[r.id]) : "—"}</td>
                <td style={{ textAlign: "center" }}>{r.kind === "manual" && <button className="btn-ghost sm" title={L("ลบ", "ဖျက်")} onClick={() => del(r)} style={{ padding: "2px 6px" }}><UIcon name="x" size={13} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="page-sub" style={{ marginTop: 10 }}>{L("* ยอดยกมาต้นเดือน = ยอดตั้งต้น + ทุกรายการก่อนเดือนนั้น · ยอดคงเหลือสิ้นเดือนจะไหลไปเป็นยอดยกมาเดือนถัดไปอัตโนมัติ · statement เทียบกับยอดคงเหลือระบบ (ควรต่าง ฿0) · รายการที่ระบบสร้างเอง (เบิกจ่าย/โอน/รับเงิน) ลบไม่ได้", "* လဆန်း လက်ကျန်ယူ = စတင်လက်ကျန် + ထိုလမတိုင်မီ စာရင်းအားလုံး · လကုန် ကျန်ငွေသည် နောက်လ လက်ကျန်ယူအဖြစ် အလိုအလျောက် ဆက်စီးမည် · statement ကို စနစ်လက်ကျန်နှင့် နှိုင်း (฿0 ကွာသင့်) · စနစ်က အလိုအလျောက် ဖန်တီးသော စာရင်း (တောင်းခံ/လွှဲ/ငွေဝင်) ဖျက်၍ မရ")}</p>

      {addOpen && <AddEntryModal accounts={accounts} defaultAccountId={single ? accountId : ""} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refresh(); }} flash={flash} />}
    </div>
  );
}

function AddEntryModal({ accounts, defaultAccountId, onClose, onSaved, flash }) {
  const lang = useLang();
  const L = (th, my) => (lang === "my" ? my : th);
  const [f, setF] = React.useState({ accountId: defaultAccountId || accounts[0]?.id || "", direction: "in", amount: "", note: "", category: "", entry_date: today() });
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.accountId) return flash(L("เลือกบัญชี", "အကောင့် ရွေးပါ"), true);
    if (!(Number(f.amount) > 0)) return flash(L("ใส่จำนวนเงิน", "ပမာဏ ဖြည့်ပါ"), true);
    setBusy(true);
    try { await addAccountEntry(f); flash(L("บันทึกรายการเดินบัญชีแล้ว ✓", "အကောင့်လှုပ်ရှား စာရင်း သိမ်းပြီး ✓")); onSaved(); }
    catch (e) { flash(L("ไม่สำเร็จ: ", "မအောင်မြင်: ") + (e.message || e), true); }
    setBusy(false);
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-head"><div className="modal-title">{L("เพิ่มรายการเดินบัญชี", "အကောင့်လှုပ်ရှား စာရင်း ထည့်")}</div><button className="modal-x" onClick={onClose}><UIcon name="x" size={18} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>{L("บัญชี", "အကောင့်")}</span>
            <select className="inp" value={f.accountId} onChange={(e) => set("accountId", e.target.value)}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{(a.kind === "cash" ? "💵 " : "🏦 ") + a.name}</option>)}
            </select></label>
          <label className="fld"><span>{L("ประเภท", "အမျိုးအစား")}</span>
            <div className="cat-filter" style={{ margin: 0 }}>
              {[["in", L("💰 เงินเข้า / ฝาก", "💰 ငွေဝင် / သွင်း")], ["out", L("💸 เงินออก / ถอน-ค่าธรรมเนียม", "💸 ငွေထွက် / ထုတ်-အခကြေး")]].map(([v, l]) => (
                <button type="button" key={v} className={"cat-chip" + (f.direction === v ? " on" : "")} onClick={() => set("direction", v)} style={f.direction === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}</button>
              ))}
            </div></label>
          <div className="fld-row">
            <label className="fld"><span>{L("วันที่", "ရက်စွဲ")}</span><input type="date" className="inp" value={f.entry_date} onChange={(e) => set("entry_date", e.target.value)} /></label>
            <label className="fld"><span>{L("จำนวนเงิน", "ပမာဏ")}</span><span className="inp inp-unit"><span className="unit-pre">฿</span><input type="number" min="0" step="0.01" value={f.amount} autoFocus onChange={(e) => set("amount", e.target.value)} /></span></label>
          </div>
          <label className="fld"><span>{L("หมวดค่าใช้จ่าย", "ကုန်ကျစရိတ် အမျိုးအစား")}</span><CategoryPicker value={f.category} onChange={(v) => set("category", v)} flash={flash} /></label>
          <label className="fld"><span>{L("รายการ / รายละเอียดเพิ่มเติม", "စာရင်း / အသေးစိတ် ထပ်ဖြည့်")}</span><textarea className="inp" rows={2} style={{ resize: "vertical" }} value={f.note} onChange={(e) => set("note", e.target.value)} placeholder={L("เช่น รับเงินลูกค้า / ดอกเบี้ย / ค่าธรรมเนียมธนาคาร", "ဥပမာ ဖောက်သည်ထံမှ ငွေ / အတိုး / ဘဏ်အခကြေး")} /></label>
        </div>
        <div className="modal-foot"><button className="btn-ghost" onClick={onClose}>{L("ยกเลิก", "ပယ်ဖျက်")}</button>
          <button className="btn-primary" disabled={busy} onClick={save}>{L("บันทึก", "သိမ်း")}</button></div>
      </div>
    </div>
  );
}
