import React from "react";
import { listInvoices, listReceipts, setInvoiceBadDebt, dashboardActionLite } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht, round2, downloadCsv } from "../lib/format";
import { UIcon } from "../icons";
import ChatCustomerLink from "./ChatCustomerLink";

// today as YYYY-MM-DD (local)
const pad = (n) => String(n).padStart(2, "0");
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysOverdue = (due, today) => Math.round((Date.parse(today + "T00:00:00") - Date.parse(due + "T00:00:00")) / 86400000);
const thDate = (s) => { try { return new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } };

// aging buckets (order matters — drives both the section order and the KPI grouping)
const BUCKETS = [
  { key: "notdue", label: "ยังไม่ครบกำหนด", color: "#059669", bg: "#dcf5e8" },
  { key: "d30",    label: "เกินกำหนด 1–30 วัน", color: "#d97706", bg: "#fef3c7" },
  { key: "d60",    label: "เกินกำหนด 31–60 วัน", color: "#ea580c", bg: "#ffedd5" },
  { key: "d90",    label: "เกินกำหนด 61–90 วัน", color: "#dc2626", bg: "#fee2e2" },
  { key: "d90p",   label: "เกินกำหนด 90 วันขึ้นไป", color: "#991b1b", bg: "#fecaca" },
  { key: "nodue",  label: "ไม่ระบุวันครบกำหนด", color: "#64748b", bg: "#f1f5f9" },
];
const BUCKET = Object.fromEntries(BUCKETS.map((b) => [b.key, b]));
const OVERDUE_KEYS = ["d30", "d60", "d90", "d90p"];

function agingOf(due, today) {
  if (!due) return { key: "nodue", days: null };
  if (due >= today) return { key: "notdue", days: 0 };
  const d = daysOverdue(due, today);
  if (d <= 30) return { key: "d30", days: d };
  if (d <= 60) return { key: "d60", days: d };
  if (d <= 90) return { key: "d90", days: d };
  return { key: "d90p", days: d };
}

export default function Receivables({ role, onOpenInvoice, onGoChat }) {
  const [rows, setRows] = React.useState(null);
  const [view, setView] = React.useState("aging"); // "aging" | "customer"
  const [q, setQ] = React.useState("");
  const [openCust, setOpenCust] = React.useState(null);
  const [badDebt, setBadDebt] = React.useState([]);
  const [totals, setTotals] = React.useState(null);   // {receivable, payable} — การ์ดสุทธิ
  const [dun, setDun] = React.useState({});            // ประวัติทวงต่อลูกค้า (เก็บในเครื่องนี้)
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };
  const today = todayYmd();

  // ── ติดตามการทวง (เก็บในเครื่องนี้จนกว่าจะปลดล็อก DB ให้ใช้ร่วมทีม) ──
  React.useEffect(() => { try { setDun(JSON.parse(localStorage.getItem("ar_dunning") || "{}") || {}); } catch { setDun({}); } }, []);
  const daysSinceDun = (cid) => { const d = dun[cid]; return d ? daysOverdue(d, today) : null; };
  function markDunned(cid) { setDun((m) => { const n = { ...m, [cid]: today }; try { localStorage.setItem("ar_dunning", JSON.stringify(n)); } catch { /* ignore */ } return n; }); flash("บันทึกว่าทวงแล้ววันนี้ ✓"); }

  async function load() {
    try {
      const [inv, rec] = await Promise.all([listInvoices(), listReceipts()]);
      dashboardActionLite().then(setTotals).catch(() => {});
      // หนี้ที่ตัดสูญแล้ว: ไม่ตามต่อ แต่ต้องโชว์ยอดสะสมไว้ให้เห็นว่าปีนี้เก็บไม่ได้ไปเท่าไหร่
      setBadDebt((inv || []).filter((x) => x.status === "bad_debt"));
      // ใบเสร็จที่ "ออกแล้วแต่ยังไม่ได้รับเงิน" (สถานะรอชำระเงิน · มักออกไว้ตอนวางบิล) → เงินยังไม่เข้า = ต้องถือเป็นค้างรับ
      const pendingRecByInv = {};
      (rec || []).forEach((r) => { if (r.invoice_no && r.status !== "paid" && r.status !== "cancelled") pendingRecByInv[r.invoice_no] = r; });
      const ar = inv
        // ค้างรับ = ใบแจ้งหนี้ที่ยังไม่ชำระ · หรือ มีใบเสร็จที่ออกแล้วแต่ยังรอชำระ (แม้ใบแจ้งหนี้จะถูกมาร์คไปแล้ว) — กันเงินหลุดจากค้างรับ
        .filter((x) => x.status !== "cancelled" && x.status !== "bad_debt" && (x.status === "unpaid" || pendingRecByInv[x.invoice_no]))
        .map((x) => {
          const pr = pendingRecByInv[x.invoice_no];
          const owed = round2((Number(x.total) || 0) - (Number(x.wht_amt) || 0));
          const ag = agingOf(x.due_date, today);
          return {
            invoice_no: x.invoice_no, customer_id: x.customer_id, customerName: x.customerName || "(ไม่ระบุลูกค้า)",
            phone: x.contactPhone || x.mainContactPhone || null, title: x.title || null,
            issue_date: x.issue_date, due_date: x.due_date, installment: x.installment,
            owed, bucket: ag.key, days: ag.days, pendingReceiptNo: pr ? pr.receipt_no : null,
          };
        })
        .filter((x) => x.owed > 0)
        .sort((a, b) => (b.days || 0) - (a.days || 0));
      setRows(ar);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setRows([]); }
  }
  React.useEffect(() => { load(); }, []);

  // ตัดหนี้สูญ = เลิกตามใบนี้ แต่ยอดขาย/ภาษีขายยังอยู่ในประวัติ (ต่างจากยกเลิกที่ลบยอดขายทิ้งด้วย)
  async function writeOff(r) {
    const reason = await confirmDialog({
      title: `ตัดหนี้สูญ ${r.invoice_no}?`,
      message: `${r.customerName} · ค้าง ${fmtBaht(r.owed)}${r.days > 0 ? ` · เกินกำหนด ${r.days} วัน` : ""}\n\nใบนี้จะหลุดจากยอดค้างรับและจากประมาณการเงินเข้า แต่ยอดขายและภาษีขายยังอยู่ในประวัติครบ (งานทำไปแล้ว ใบกำกับภาษีออกไปแล้ว)\n\nถ้าเก็บเงินได้ทีหลัง ต้องแจ้งให้แก้สถานะกลับ`,
      danger: true, confirmText: "ตัดหนี้สูญ",
      prompt: { label: "เหตุผล (บังคับ)", placeholder: "เช่น ลูกค้าปิดกิจการ · ติดต่อไม่ได้เกิน 1 ปี · ตกลงยอมความแล้ว", required: true },
    });
    if (!reason) return;
    try { await setInvoiceBadDebt(r.invoice_no, String(reason)); flash(`ตัดหนี้สูญ ${r.invoice_no} แล้ว`); await load(); }
    catch (e) { flash(e.message || String(e), true); }
  }

  const matches = (r) => { const n = q.trim().toLowerCase(); if (!n) return true; return [r.customerName, r.invoice_no, r.title, r.phone].some((f) => String(f || "").toLowerCase().includes(n)); };
  const shown = React.useMemo(() => (rows || []).filter(matches), [rows, q]);

  // KPIs
  const totalOwed = shown.reduce((a, r) => a + r.owed, 0);
  const overdueOwed = shown.filter((r) => OVERDUE_KEYS.includes(r.bucket)).reduce((a, r) => a + r.owed, 0);
  const custCount = new Set(shown.map((r) => r.customer_id)).size;
  // อายุหนี้เฉลี่ยถ่วงน้ำหนัก (นับจากวันออกใบแจ้งหนี้) — วัดว่าเงินค้างเฉลี่ยนานแค่ไหน
  const daysIssue = (r) => (r.issue_date ? Math.max(0, daysOverdue(r.issue_date, today)) : 0);
  const wAge = totalOwed > 0 ? Math.round(shown.reduce((a, r) => a + r.owed * daysIssue(r), 0) / totalOwed) : 0;
  // การกระจายอายุหนี้ (สัดส่วนของยอด) ต่อ bucket
  const bucketSum = React.useMemo(() => { const m = {}; BUCKETS.forEach((b) => (m[b.key] = 0)); shown.forEach((r) => (m[r.bucket] += r.owed)); return m; }, [shown]);

  // group by bucket (aging view)
  const byBucket = React.useMemo(() => {
    const m = {}; BUCKETS.forEach((b) => (m[b.key] = []));
    shown.forEach((r) => m[r.bucket].push(r));
    return m;
  }, [shown]);

  // group by customer (customer view)
  const byCustomer = React.useMemo(() => {
    const m = {};
    shown.forEach((r) => {
      const c = m[r.customer_id] || (m[r.customer_id] = { customer_id: r.customer_id, name: r.customerName, phone: r.phone, total: 0, worstDays: -1, worstBucket: "notdue", invoices: [] });
      c.total += r.owed; c.invoices.push(r);
      const dv = r.days == null ? -0.5 : r.days; // unknown due dates rank just below "not due"
      if (dv > c.worstDays) { c.worstDays = dv; c.worstBucket = r.bucket; }
      if (!c.phone && r.phone) c.phone = r.phone;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [shown]);
  // ลูกค้าที่ "ควรทวงวันนี้" = มีหนี้เกินกำหนด และยังไม่ทวง หรือทวงครั้งล่าสุดเกิน 7 วัน
  const needDun = byCustomer.filter((c) => OVERDUE_KEYS.includes(c.worstBucket) && (daysSinceDun(c.customer_id) == null || daysSinceDun(c.customer_id) >= 7)).length;

  function exportCsv() {
    if (!shown.length) return flash("ไม่มีข้อมูลให้ส่งออก", true);
    const headers = ["ลูกค้า", "เลขใบแจ้งหนี้", "ยอดค้างรับ(สุทธิ)", "วันครบกำหนด", "สถานะอายุหนี้", "เกินกำหนด(วัน)", "เบอร์โทร"];
    const rows = shown.map((r) => [r.customerName, r.invoice_no, r.owed, r.due_date || "", BUCKET[r.bucket].label, r.days > 0 ? r.days : 0, r.phone || ""]);
    downloadCsv(`เงินค้างรับ-${today}`, headers, rows);
  }

  function InvoiceRow({ r, showBucket }) {
    const b = BUCKET[r.bucket];
    return (
      <div className="ar-row">
        <div className="ar-row-main">
          {showBucket && <span className="ar-dot" style={{ background: b.color }} />}
          <b className="ar-inv">{r.invoice_no}</b>
          {r.installment > 1 && <span className="ar-inst">งวด {r.installment}</span>}
          {r.pendingReceiptNo && <span className="ar-inst" style={{ background: "#fef3c7", color: "#b45309", borderColor: "#fde68a" }} title={`ออกใบเสร็จ ${r.pendingReceiptNo} แล้ว (มักตอนวางบิล) แต่ยังไม่ได้รับเงิน`}>🧾 ออกใบเสร็จแล้ว · รอชำระ</span>}
          <span className="ar-cust">{r.customerName}</span>
          <span className="ar-owed">{fmtBaht(r.owed)}</span>
        </div>
        <div className="ar-row-sub">
          <span className="ar-due">
            {r.due_date ? <>ครบกำหนด {thDate(r.due_date)}{r.days > 0 ? <b style={{ color: b.color }}> · เกิน {r.days} วัน</b> : r.bucket === "notdue" ? <span style={{ color: "#059669" }}> · ยังไม่ถึงกำหนด</span> : null}</> : <span style={{ color: "#64748b" }}>ไม่ระบุวันครบกำหนด</span>}
          </span>
          <span className="ar-acts">
            {r.phone && <a className="btn-ghost sm" href={`tel:${r.phone}`} onClick={(e) => e.stopPropagation()}><UIcon name="user" size={13} /> โทร</a>}
            <ChatCustomerLink role={role} customerId={r.customer_id} onGoChat={onGoChat} />
            {onOpenInvoice && <button className="btn-ghost sm" onClick={() => onOpenInvoice(r.invoice_no)}><UIcon name="clipboard" size={13} /> ดูใบ</button>}
            {/* ตัดหนี้สูญ = การเงิน/ผู้บริหาร/ธุรการเท่านั้น (เป็นการยอมรับว่าเก็บเงินไม่ได้) */}
            {["admin", "exec", "finance"].includes(role) && <button className="btn-ghost sm" style={{ color: "#dc2626" }} onClick={(e) => { e.stopPropagation(); writeOff(r); }}>ตัดหนี้สูญ</button>}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">เงินค้างรับ <span className="page-title-en">Receivables</span></h1>
          <p className="page-sub">ใบแจ้งหนี้ที่ยังไม่ได้รับเงิน + ใบเสร็จที่ออกแล้วแต่ยังรอชำระ (🧾) · จัดกลุ่มตามอายุหนี้ · ตามเก็บเงินได้เร็วขึ้น</p></div>
        <div className="cat-head-actions" style={{ gap: 8 }}>
          <div className="seg">
            <button className={"seg-btn" + (view === "aging" ? " on" : "")} onClick={() => setView("aging")}>ตามอายุหนี้</button>
            <button className={"seg-btn" + (view === "customer" ? " on" : "")} onClick={() => setView("customer")}>ตามลูกค้า</button>
          </div>
          <button className="btn-ghost sm" onClick={exportCsv}>⬇ Export</button>
          <button className="btn-ghost sm" onClick={load}>🔄 รีเฟรช</button>
        </div>
      </div>

      <div className="kpi-grid jp-kpi">
        <div className="stat-card"><div className="stat-val" style={{ color: "#1d4ed8" }}>{fmtBaht(totalOwed)}</div><div className="stat-label">ยอดค้างรับทั้งหมด</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#dc2626" }}>{fmtBaht(overdueOwed)}</div><div className="stat-label">เกินกำหนดชำระ</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: wAge > 45 ? "#dc2626" : wAge > 20 ? "#d97706" : "var(--ink)" }}>{wAge} วัน</div><div className="stat-label">อายุหนี้เฉลี่ย (ถ่วงยอด)</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: needDun ? "#dc2626" : "var(--up)" }}>{needDun}</div><div className="stat-label">🔔 ควรทวงวันนี้ (ราย)</div></div>
        <div className="stat-card"><div className="stat-val">{custCount}</div><div className="stat-label">ลูกค้าที่ค้างจ่าย</div></div>
        {badDebt.length > 0 && (
          <div className="stat-card"><div className="stat-val" style={{ color: "#991b1b" }}>{fmtBaht(badDebt.reduce((a, x) => a + ((Number(x.total) || 0) - (Number(x.wht_amt) || 0)), 0))}</div>
            <div className="stat-label">หนี้สูญสะสม · {badDebt.length} ใบ (ไม่ตามต่อแล้ว)</div></div>
        )}
      </div>

      {totals && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "var(--surface-2,#f3f7f8)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
        <b>สรุปสุทธิ:</b>
        <span>📥 ค้างรับ <b style={{ color: "#1d4ed8" }}>{fmtBaht(totals.receivable)}</b></span><span style={{ color: "var(--ink-3)" }}>−</span>
        <span>📤 ค้างจ่าย <b style={{ color: "#dc2626" }}>{fmtBaht(totals.payable)}</b></span><span style={{ color: "var(--ink-3)" }}>=</span>
        <span>สุทธิ <b style={{ color: (totals.receivable - totals.payable) >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(totals.receivable - totals.payable)}</b></span>
        <span className="jo-dim" style={{ fontSize: 12 }}>{(totals.receivable - totals.payable) >= 0 ? "· เก็บได้มากกว่าต้องจ่าย" : "· ต้องจ่ายมากกว่าจะเก็บได้"}</span>
      </div>}

      {totalOwed > 0 && <div style={{ background: "var(--surface,#fff)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginBottom: 6 }}>การกระจายอายุหนี้ (สัดส่วนของยอดค้างรับ)</div>
        <div style={{ display: "flex", height: 16, borderRadius: 6, overflow: "hidden", border: "1px solid var(--line)" }}>
          {BUCKETS.filter((b) => bucketSum[b.key] > 0).map((b) => <div key={b.key} title={`${b.label}: ${fmtBaht(bucketSum[b.key])}`} style={{ width: `${bucketSum[b.key] / totalOwed * 100}%`, background: b.color }} />)}
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
          {BUCKETS.filter((b) => bucketSum[b.key] > 0).map((b) => <span key={b.key} style={{ fontSize: 11.5, color: "var(--ink-2)" }}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: b.color, marginRight: 4, verticalAlign: -1 }} />{b.label} {Math.round(bucketSum[b.key] / totalOwed * 100)}%</span>)}
        </div>
      </div>}

      <div className="cat-search" style={{ maxWidth: 380, marginBottom: 14 }}>
        <UIcon name="search" size={16} color="var(--ink-3)" />
        <input placeholder="ค้นหา ลูกค้า / เลขใบแจ้งหนี้ / เบอร์โทร" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {rows === null ? <div className="empty">กำลังโหลด…</div>
        : shown.length === 0 ? <div className="empty" style={{ padding: 40 }}>🎉 ไม่มีเงินค้างรับ — เก็บเงินครบทุกใบแล้ว</div>
        : view === "aging" ? (
          <div className="ar-buckets">
            {BUCKETS.map((b) => {
              const list = byBucket[b.key];
              if (!list.length) return null;
              const sum = list.reduce((a, r) => a + r.owed, 0);
              return (
                <div key={b.key} className="ar-bucket card">
                  <div className="ar-bucket-head" style={{ borderLeft: `5px solid ${b.color}` }}>
                    <span className="ar-bucket-label" style={{ color: b.color }}>{b.label}</span>
                    <span className="ar-bucket-cnt">{list.length} ใบ</span>
                    <span className="ar-bucket-sum" style={{ color: b.color }}>{fmtBaht(sum)}</span>
                  </div>
                  {list.map((r) => <InvoiceRow key={r.invoice_no} r={r} />)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ar-custs">
            {byCustomer.map((c) => {
              const b = BUCKET[c.worstBucket];
              const open = openCust === c.customer_id;
              const overdue = OVERDUE_KEYS.includes(c.worstBucket);
              const dsd = daysSinceDun(c.customer_id);   // วันตั้งแต่ทวงครั้งล่าสุด (null = ยังไม่เคย)
              const shouldDun = overdue && (dsd == null || dsd >= 7);
              return (
                <div key={c.customer_id || "none"} className="ar-cust-card card">
                  <button className="ar-cust-head" onClick={() => setOpenCust(open ? null : c.customer_id)}>
                    <span className="ar-dot" style={{ background: b.color }} />
                    <span className="ar-cust-name">{c.name}{shouldDun && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", borderRadius: 8, padding: "1px 7px" }}>🔔 ควรทวง</span>}</span>
                    <span className="ar-cust-meta">{c.invoices.length} ใบ{dsd != null ? ` · ทวงล่าสุด ${dsd === 0 ? "วันนี้" : dsd + " วันก่อน"}` : overdue ? " · ยังไม่เคยทวง" : ""}</span>
                    <span className="ar-cust-total" style={{ color: b.color }}>{fmtBaht(c.total)}</span>
                    <UIcon name="chevR" size={15} style={{ transform: open ? "rotate(90deg)" : "none", color: "var(--ink-3)" }} />
                  </button>
                  <div className="ar-cust-actions">
                    {c.phone && <a className="btn-ghost sm" href={`tel:${c.phone}`}><UIcon name="user" size={13} /> โทร {c.phone}</a>}
                    <ChatCustomerLink role={role} customerId={c.customer_id} onGoChat={onGoChat} />
                    {overdue && <button className="btn-ghost sm" style={{ color: shouldDun ? "#b91c1c" : "var(--ink-3)" }} title="บันทึกว่าทวงลูกค้ารายนี้แล้ววันนี้ (เก็บในเครื่องนี้)" onClick={() => markDunned(c.customer_id)}>✅ ทวงแล้ววันนี้</button>}
                  </div>
                  {open && <div className="ar-cust-invs">{c.invoices.map((r) => <InvoiceRow key={r.invoice_no} r={r} showBucket />)}</div>}
                </div>
              );
            })}
          </div>
        )}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
