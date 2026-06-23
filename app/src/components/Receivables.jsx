import React from "react";
import { listInvoices } from "../lib/api";
import { fmtBaht, round2 } from "../lib/format";
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
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };
  const today = todayYmd();

  async function load() {
    try {
      const inv = await listInvoices();
      const ar = inv
        .filter((x) => x.status === "unpaid")
        .map((x) => {
          const owed = round2((Number(x.total) || 0) - (Number(x.wht_amt) || 0));
          const ag = agingOf(x.due_date, today);
          return {
            invoice_no: x.invoice_no, customer_id: x.customer_id, customerName: x.customerName || "(ไม่ระบุลูกค้า)",
            phone: x.contactPhone || x.mainContactPhone || null, title: x.title || null,
            issue_date: x.issue_date, due_date: x.due_date, installment: x.installment,
            owed, bucket: ag.key, days: ag.days,
          };
        })
        .filter((x) => x.owed > 0)
        .sort((a, b) => (b.days || 0) - (a.days || 0));
      setRows(ar);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setRows([]); }
  }
  React.useEffect(() => { load(); }, []);

  const matches = (r) => { const n = q.trim().toLowerCase(); if (!n) return true; return [r.customerName, r.invoice_no, r.title, r.phone].some((f) => String(f || "").toLowerCase().includes(n)); };
  const shown = React.useMemo(() => (rows || []).filter(matches), [rows, q]);

  // KPIs
  const totalOwed = shown.reduce((a, r) => a + r.owed, 0);
  const overdueOwed = shown.filter((r) => OVERDUE_KEYS.includes(r.bucket)).reduce((a, r) => a + r.owed, 0);
  const custCount = new Set(shown.map((r) => r.customer_id)).size;

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

  function InvoiceRow({ r, showBucket }) {
    const b = BUCKET[r.bucket];
    return (
      <div className="ar-row">
        <div className="ar-row-main">
          {showBucket && <span className="ar-dot" style={{ background: b.color }} />}
          <b className="ar-inv">{r.invoice_no}</b>
          {r.installment > 1 && <span className="ar-inst">งวด {r.installment}</span>}
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
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">เงินค้างรับ <span className="page-title-en">Receivables</span></h1>
          <p className="page-sub">ใบแจ้งหนี้ที่ยังไม่ได้รับเงิน · จัดกลุ่มตามอายุหนี้ (เกินกำหนดกี่วัน) · ตามเก็บเงินได้เร็วขึ้น</p></div>
        <div className="cat-head-actions" style={{ gap: 8 }}>
          <div className="seg">
            <button className={"seg-btn" + (view === "aging" ? " on" : "")} onClick={() => setView("aging")}>ตามอายุหนี้</button>
            <button className={"seg-btn" + (view === "customer" ? " on" : "")} onClick={() => setView("customer")}>ตามลูกค้า</button>
          </div>
          <button className="btn-ghost sm" onClick={load}>🔄 รีเฟรช</button>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="stat-card"><div className="stat-val" style={{ color: "#1d4ed8" }}>{fmtBaht(totalOwed)}</div><div className="stat-label">ยอดค้างรับทั้งหมด</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#dc2626" }}>{fmtBaht(overdueOwed)}</div><div className="stat-label">เกินกำหนดชำระ</div></div>
        <div className="stat-card"><div className="stat-val">{shown.length}</div><div className="stat-label">จำนวนใบแจ้งหนี้</div></div>
        <div className="stat-card"><div className="stat-val">{custCount}</div><div className="stat-label">ลูกค้าที่ค้างจ่าย</div></div>
      </div>

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
              return (
                <div key={c.customer_id || "none"} className="ar-cust-card card">
                  <button className="ar-cust-head" onClick={() => setOpenCust(open ? null : c.customer_id)}>
                    <span className="ar-dot" style={{ background: b.color }} />
                    <span className="ar-cust-name">{c.name}</span>
                    <span className="ar-cust-meta">{c.invoices.length} ใบ</span>
                    <span className="ar-cust-total" style={{ color: b.color }}>{fmtBaht(c.total)}</span>
                    <UIcon name="chevR" size={15} style={{ transform: open ? "rotate(90deg)" : "none", color: "var(--ink-3)" }} />
                  </button>
                  {c.phone && (
                    <div className="ar-cust-actions">
                      <a className="btn-ghost sm" href={`tel:${c.phone}`}><UIcon name="user" size={13} /> โทร {c.phone}</a>
                      <ChatCustomerLink role={role} customerId={c.customer_id} onGoChat={onGoChat} />
                    </div>
                  )}
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
