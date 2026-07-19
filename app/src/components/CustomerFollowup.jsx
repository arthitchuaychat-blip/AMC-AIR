import React from "react";
// ⚠️ listQuotations() ไม่ส่ง opts = โหลดทั้งประวัติโดยตั้งใจ — ใบที่ค้างตอบอาจเก่ากว่าหน้าต่างวันที่ใด ๆ
import { listJobOrders, listQuotations } from "../lib/api";
import { JOB_TYPES, jobTypeDef } from "../lib/schedule";
import { UIcon } from "../icons";
import ChatCustomerLink from "./ChatCustomerLink";

const pad = (n) => String(n).padStart(2, "0");
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const dayDiff = (from, to) => Math.floor((Date.parse(to + "T00:00:00") - Date.parse(String(from).slice(0, 10) + "T00:00:00")) / 86400000);
const thDate = (s) => { try { return new Date(String(s).slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } };
function agoText(days) {
  if (days <= 0) return "วันนี้";
  if (days < 30) return `${days} วันที่แล้ว`;
  if (days < 365) return `${Math.floor(days / 30)} เดือนที่แล้ว`;
  const y = Math.floor(days / 365), m = Math.floor((days % 365) / 30);
  return m ? `${y} ปี ${m} เดือนที่แล้ว` : `${y} ปีที่แล้ว`;
}

// recency buckets — first bucket whose `max` (days) covers the elapsed time
const BUCKETS = [
  { key: "d7",   label: "ภายใน 7 วัน",     max: 7,        color: "#059669", bg: "#dcf5e8" },
  { key: "d30",  label: "8–30 วัน",         max: 30,       color: "#0891b2", bg: "#cffafe" },
  { key: "d60",  label: "1–2 เดือน",        max: 60,       color: "#2563eb", bg: "#dbeafe" },
  { key: "d180", label: "2–6 เดือน",        max: 180,      color: "#d97706", bg: "#fef3c7" },
  { key: "d365", label: "6–12 เดือน",       max: 365,      color: "#ea580c", bg: "#ffedd5" },
  { key: "old",  label: "เกิน 1 ปี",        max: Infinity, color: "#dc2626", bg: "#fee2e2" },
];
const BUCKET = Object.fromEntries(BUCKETS.map((b) => [b.key, b]));
const bucketOf = (days) => (BUCKETS.find((b) => days <= b.max) || BUCKETS[BUCKETS.length - 1]).key;

const CADENCES = [[90, "3 เดือน"], [180, "6 เดือน"], [365, "1 ปี"]];
const QUOTE_AGES = [[3, "เกิน 3 วัน"], [7, "เกิน 7 วัน"], [14, "เกิน 14 วัน"], [30, "เกิน 30 วัน"]];

// the date a (completed) job was actually serviced: latest visit → end → scheduled → created
function jobServiceDate(j) {
  const vd = (j.visits || []).map((v) => v.visit_date).filter(Boolean).sort();
  return String(vd.length ? vd[vd.length - 1] : (j.end_date || j.scheduled_at || j.created_at || "")).slice(0, 10);
}

export default function CustomerFollowup({ role, onGoChat, onOpenCustomer, onCreateJob }) {
  const [jobs, setJobs] = React.useState(null);
  const [quotes, setQuotes] = React.useState(null);
  const [tab, setTab] = React.useState("service");   // service = รอบบริการ (ของเดิม) · quotes = ใบเสนอราคาค้างตอบ
  const [qAge, setQAge] = React.useState(7);         // ค้างตอบเกินกี่วันถึงนับ
  const [cadence, setCadence] = React.useState(180);   // "รอบติดตาม" default 6 months
  const [dueOnly, setDueOnly] = React.useState(false); // show only customers past the cadence
  const [typeF, setTypeF] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };
  const today = todayYmd();

  async function load() {
    try {
      const [j, q] = await Promise.all([listJobOrders(), listQuotations().catch(() => [])]);
      setJobs(j); setQuotes(q || []);
    }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setJobs([]); setQuotes([]); }
  }
  React.useEffect(() => { load(); }, []);

  // build one entry per customer from their COMPLETED jobs
  const customers = React.useMemo(() => {
    if (!jobs) return [];
    const m = {};
    jobs.filter((j) => j.status === "done" && j.customer_id != null).forEach((j) => {
      const c = m[j.customer_id] || (m[j.customer_id] = {
        customer_id: j.customer_id, name: j.customerName || "(ไม่ระบุลูกค้า)",
        phone: j.contact_phone || j.mainContactPhone || null, jobs: [], lastByType: {},
      });
      const date = jobServiceDate(j);
      c.jobs.push({ job_no: j.job_no, type: j.job_type || "other", title: j.title || null, date, siteName: j.siteName || null });
      if (!c.phone && (j.contact_phone || j.mainContactPhone)) c.phone = j.contact_phone || j.mainContactPhone;
      if (!c.lastByType[j.job_type] || date > c.lastByType[j.job_type]) c.lastByType[j.job_type] = date;
    });
    return Object.values(m).map((c) => {
      c.jobs.sort((a, b) => (a.date < b.date ? 1 : -1));   // newest first
      const last = c.jobs[0];
      const days = dayDiff(last.date, today);
      return { ...c, last, days, bucket: bucketOf(days), times: c.jobs.length, due: days >= cadence };
    }).sort((a, b) => b.days - a.days); // most overdue first
  }, [jobs, today, cadence]);

  // ใบเสนอราคาที่ส่งไปแล้วยังไม่ได้คำตอบ
  // ⚠️ ต้องตัดใบที่ "ตอบรับแล้วจริง" ออก — ใบที่ยัง draft/sent แต่มีใบงาน/ใบแจ้งหนี้แล้ว คือปิดการขายไปแล้ว
  //    แค่ลืมกดอนุมัติ ถ้านับเป็นค้างตอบ เซลล์จะโทรตามลูกค้าที่จ่ายเงินไปแล้ว
  const pendingQuotes = React.useMemo(() => {
    if (!quotes) return [];
    return quotes.filter((q) => {
      if (!["draft", "sent"].includes(q.status)) return false;   // อนุมัติ/ยกเลิก/ปฏิเสธ/หมดอายุ = ไม่ต้องตาม
      if (q.hasJob || q.hasInvoice) return false;   // มีใบงาน/ใบแจ้งหนี้แล้ว = ตอบรับแล้วจริง
      const base = String(q.issue_date || q.created_at || "").slice(0, 10);
      if (!base) return false;                                    // ใบร่างที่ยังไม่ลงวันที่ — คิดอายุไม่ได้ ไม่นับ
      const days = dayDiff(base, today);
      return Number.isFinite(days) && days >= qAge;
    }).map((q) => ({ ...q, days: dayDiff(String(q.issue_date || q.created_at).slice(0, 10), today) }))
      .sort((a, b) => b.days - a.days);
  }, [quotes, qAge, today]);

  const matches = (c) =>
    (typeF === "all" || c.lastByType[typeF] != null) &&
    (!dueOnly || c.due) &&
    (() => { const n = q.trim().toLowerCase(); if (!n) return true; return [c.name, c.phone, c.last?.title].some((f) => String(f || "").toLowerCase().includes(n)); })();
  const shown = customers.filter(matches);

  // KPIs
  const dueCount = customers.filter((c) => c.due).length;
  const recent30 = customers.filter((c) => c.days <= 30).length;
  const cold = customers.filter((c) => c.days > 365).length;

  const byBucket = React.useMemo(() => {
    const m = {}; BUCKETS.forEach((b) => (m[b.key] = []));
    shown.forEach((c) => m[c.bucket].push(c));
    return m;
  }, [shown]);

  function CustomerRow({ c }) {
    const b = BUCKET[c.bucket];
    const td = jobTypeDef(c.last.type);
    const open = openId === c.customer_id;
    return (
      <div className="fu-row">
        <div className="fu-row-main">
          <span className="fu-dot" style={{ background: b.color }} />
          <span className="fu-name">{c.name}</span>
          {c.due && <span className="fu-due">🔔 ถึงเวลาติดตาม</span>}
          <span className="fu-times">ใช้บริการ {c.times} ครั้ง</span>
          <span className="fu-ago" style={{ color: b.color }}>{agoText(c.days)}</span>
        </div>
        <div className="fu-row-sub">
          <span className="fu-last">
            <span className="fu-type" style={{ background: td[3] }}>{td[2]} {td[1]}</span>
            ล่าสุด {thDate(c.last.date)}{c.last.siteName ? ` · ${c.last.siteName}` : ""}{c.last.title ? ` · ${c.last.title}` : ""}
          </span>
          <span className="fu-acts">
            {c.phone && <a className="btn-ghost sm" href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()}><UIcon name="user" size={13} /> โทร</a>}
            <ChatCustomerLink role={role} customerId={c.customer_id} onGoChat={onGoChat} />
            {onCreateJob && <button className="btn-primary sm" onClick={() => onCreateJob(c.customer_id)}><UIcon name="plus" size={13} color="#fff" /> ขายซ้ำ</button>}
            <button className="btn-ghost sm" onClick={() => setOpenId(open ? null : c.customer_id)}>
              <UIcon name="clipboard" size={13} /> ประวัติ ({c.times})
            </button>
          </span>
        </div>
        {open && (
          <div className="fu-history">
            {c.jobs.map((jb) => { const d = jobTypeDef(jb.type); return (
              <div className="fu-hist-row" key={jb.job_no}>
                <span className="fu-type sm" style={{ background: d[3] }}>{d[2]} {d[1]}</span>
                <b>{jb.job_no}</b>
                <span style={{ color: "var(--ink-3)" }}>{thDate(jb.date)}</span>
                {jb.siteName && <span style={{ color: "var(--ink-3)" }}>· {jb.siteName}</span>}
                {jb.title && <span style={{ color: "var(--ink-2)" }}>· {jb.title}</span>}
              </div>
            ); })}
            {onOpenCustomer && <button className="btn-ghost sm" style={{ marginTop: 6 }} onClick={() => onOpenCustomer(c.customer_id)}><UIcon name="building" size={13} /> เปิดหน้าลูกค้า</button>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ติดตามลูกค้า <span className="page-title-en">Follow-up</span></h1>
          <p className="page-sub">ลูกค้าใช้บริการอะไร ครั้งล่าสุดเมื่อไหร่ · ครบรอบแล้วโทรขายซ้ำ (เช่น ล้างแอร์ทุก 6 เดือน)</p></div>
        <div className="cat-head-actions" style={{ gap: 8, flexWrap: "wrap" }}>
          {/* รอบติดตามใช้กับแท็บบริการเท่านั้น — ถ้าโชว์ในแท็บใบเสนอจะเข้าใจผิดว่า 6 เดือนไปกรองใบเสนอราคา */}
          {tab === "service" ? (
            <label className="fu-cad">รอบติดตาม
              <div className="seg">{CADENCES.map(([d, l]) => <button key={d} className={"seg-btn" + (cadence === d ? " on" : "")} onClick={() => setCadence(d)}>{l}</button>)}</div>
            </label>
          ) : (
            <label className="fu-cad">ค้างตอบ
              <div className="seg">{QUOTE_AGES.map(([d, l]) => <button key={d} className={"seg-btn" + (qAge === d ? " on" : "")} onClick={() => setQAge(d)}>{l}</button>)}</div>
            </label>
          )}
          <button className="btn-ghost sm" onClick={load}>🔄 รีเฟรช</button>
        </div>
      </div>

      <div className="cat-filter" style={{ marginBottom: 10 }}>
        <button className={"cat-chip" + (tab === "service" ? " on" : "")} onClick={() => setTab("service")}
          style={tab === "service" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>รอบบริการ ({customers.length})</button>
        <button className={"cat-chip" + (tab === "quotes" ? " on" : "")} onClick={() => setTab("quotes")}
          style={tab === "quotes" ? { background: "#dc2626", color: "#fff", borderColor: "#dc2626" } : {}}>ใบเสนอราคาค้างตอบ ({pendingQuotes.length})</button>
      </div>

      {tab === "quotes" ? (
        quotes === null ? <div className="empty">กำลังโหลด…</div>
        : pendingQuotes.length === 0 ? <div className="empty" style={{ padding: 40 }}>ไม่มีใบเสนอราคาค้างตอบเกิน {qAge} วัน 👍</div>
        : (
          <div className="job-cards">
            {pendingQuotes.map((q) => (
              <div className="card" key={q.quote_no} style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                  <b>{q.quote_no}</b>
                  <span>{q.customerName || "(ไม่ระบุลูกค้า)"}</span>
                  <span style={{ marginLeft: "auto", fontWeight: 700 }}>{q.grand != null ? q.grand.toLocaleString("th-TH", { maximumFractionDigits: 0 }) + " บาท" : ""}</span>
                </div>
                <div className="jo-dim" style={{ marginTop: 2 }}>
                  {q.title || ""}{q.title ? " · " : ""}ส่งเมื่อ {thDate(q.issue_date || q.created_at)} · <b style={{ color: q.days >= 30 ? "#b91c1c" : "#d97706" }}>{agoText(q.days)}</b>
                  {q.status === "draft" && <span style={{ color: "#64748b" }}> · ยังเป็นร่าง</span>}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {q.contactPhone && <a className="btn-ghost sm" href={`tel:${q.contactPhone}`}><UIcon name="user" size={13} /> โทร</a>}
                  <ChatCustomerLink role={role} customerId={q.customer_id} onGoChat={onGoChat} />
                  {onOpenQuote && <button className="btn-ghost sm" onClick={() => onOpenQuote(q.quote_no)}>เปิดใบเสนอราคา ↗</button>}
                  {onOpenCustomer && <button className="btn-ghost sm" onClick={() => onOpenCustomer(q.customer_id)}>ดูลูกค้า</button>}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (<>
      <div className="kpi-grid">
        <button className={"stat-card fu-kpi" + (dueOnly ? " on" : "")} onClick={() => setDueOnly((v) => !v)} title="กดเพื่อกรองเฉพาะที่ถึงเวลาติดตาม">
          <div className="stat-val" style={{ color: "#dc2626" }}>{dueCount}</div><div className="stat-label">🔔 ถึงเวลาติดตาม (กดกรอง)</div>
        </button>
        <div className="stat-card"><div className="stat-val">{customers.length}</div><div className="stat-label">ลูกค้าที่เคยใช้บริการ</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#059669" }}>{recent30}</div><div className="stat-label">บริการใน 30 วัน</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#dc2626" }}>{cold}</div><div className="stat-label">เกิน 1 ปีไม่ติดต่อ</div></div>
      </div>

      <div className="fu-filters">
        <div className="cat-search" style={{ maxWidth: 320 }}>
          <UIcon name="search" size={16} color="var(--ink-3)" />
          <input placeholder="ค้นหา ลูกค้า / เบอร์ / งาน" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="fu-type-chips">
          <button className={"cat-chip" + (typeF === "all" ? " on" : "")} onClick={() => setTypeF("all")}>ทุกบริการ</button>
          {JOB_TYPES.filter(([k]) => k !== "survey").map(([k, label, icon, color]) => (
            <button key={k} className={"cat-chip" + (typeF === k ? " on" : "")} onClick={() => setTypeF(k)}
              style={typeF === k ? { background: color, color: "#fff", borderColor: color } : {}}>{icon} {label}</button>
          ))}
        </div>
      </div>

      {jobs === null ? <div className="empty">กำลังโหลด…</div>
        : shown.length === 0 ? <div className="empty" style={{ padding: 40 }}>{dueOnly ? "ไม่มีลูกค้าที่ถึงเวลาติดตามในรอบนี้ 👍" : "ยังไม่มีลูกค้าที่ใช้บริการเสร็จ (งานสถานะ ‘เสร็จงาน’)"}</div>
        : (
          <div className="fu-buckets">
            {BUCKETS.map((b) => {
              const list = byBucket[b.key];
              if (!list.length) return null;
              return (
                <div key={b.key} className="fu-bucket card">
                  <div className="fu-bucket-head" style={{ borderLeft: `5px solid ${b.color}` }}>
                    <span className="fu-bucket-label" style={{ color: b.color }}>{b.label}</span>
                    <span className="fu-bucket-cnt">{list.length} ราย</span>
                  </div>
                  {list.map((c) => <CustomerRow key={c.customer_id} c={c} />)}
                </div>
              );
            })}
          </div>
        )}
      </>)}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
