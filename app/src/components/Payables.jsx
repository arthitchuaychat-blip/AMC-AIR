import React from "react";
import { listPayables, dashboardActionLite } from "../lib/api";
import { fmtBaht, downloadCsv } from "../lib/format";
import { UIcon } from "../icons";
import FilterBar from "./FilterBar";

// ก้อนอายุค้างจ่าย (นับจากวันเอกสาร) — ให้เห็นเจ้าหนี้ที่ค้างนานเกินไป เหมือนฝั่งค้างรับ
const AGES = [
  { key: "a30", label: "ค้าง 0–30 วัน", color: "#059669" },
  { key: "a60", label: "ค้าง 31–60 วัน", color: "#d97706" },
  { key: "a90", label: "ค้าง 61–90 วัน", color: "#ea580c" },
  { key: "a90p", label: "ค้างเกิน 90 วัน", color: "#dc2626" },
  { key: "anone", label: "ไม่ระบุวันที่", color: "#64748b" },
];
const AGE = Object.fromEntries(AGES.map((a) => [a.key, a]));
const ageKey = (days) => days == null ? "anone" : days <= 30 ? "a30" : days <= 60 ? "a60" : days <= 90 ? "a90" : "a90p";

// เมนู "ค้างจ่าย" — กระจกเงาของ "เงินค้างรับ" ฝั่งเจ้าหนี้: ใครที่เรายังไม่ได้จ่าย รวมเท่าไหร่ ค้างมากี่วัน
// 4 ประเภท (ไม่นับซ้ำกัน): ใบสั่งซื้อยังไม่จ่าย · เบิกจ่ายอนุมัติแล้วรอจ่าย · ใบจ่ายช่างซัพรอจ่าย · ค่าแรงซัพยังไม่ตั้งเบิก
const pad = (n) => String(n).padStart(2, "0");
const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const daysSince = (ymd, today) => { try { return Math.max(0, Math.round((Date.parse(today + "T00:00:00") - Date.parse(ymd + "T00:00:00")) / 86400000)); } catch { return 0; } };
const thDate = (s) => { try { return new Date(s + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } };

const TYPES = [
  { key: "po",      label: "ใบสั่งซื้อ · ค้างจ่ายผู้ขาย",        color: "#7c3aed", bg: "#f3e8ff" },
  { key: "expense", label: "เบิกจ่าย · อนุมัติแล้วรอจ่าย",       color: "#d97706", bg: "#fef3c7" },
  { key: "payout",  label: "ใบจ่ายช่างซัพ · รอจ่าย",             color: "#0369a1", bg: "#e0f2fe" },
  { key: "labor",   label: "ค่าแรงช่างซัพ · ยังไม่ตั้งเบิกจ่าย", color: "#64748b", bg: "#f1f5f9" },
];
const TYPE = Object.fromEntries(TYPES.map((t) => [t.key, t]));

export default function Payables({ role, onOpenPo, onGoExpenses, onGoSub }) {
  const [rows, setRows] = React.useState(null);
  const [view, setView] = React.useState("type"); // "type" | "creditor" | "age"
  const [q, setQ] = React.useState("");
  const [recvF, setRecvF] = React.useState("all"); // all | received | pending — กรองสถานะรับสินค้า (เฉพาะ PO)
  const [openCred, setOpenCred] = React.useState(null);
  const [totals, setTotals] = React.useState(null);   // {receivable, payable} — การ์ดสุทธิ
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2600); };
  const today = todayYmd();

  async function load() {
    try {
      const list = await listPayables();
      setRows(list.filter((r) => r.amount > 0).map((r) => ({ ...r, days: r.date ? daysSince(r.date, today) : null, age: ageKey(r.date ? daysSince(r.date, today) : null) }))
        .sort((a, b) => (b.date || "").localeCompare(a.date || ""))); // ล่าสุดบนสุด (ตามวันที่เอกสาร)
      dashboardActionLite().then(setTotals).catch(() => {});
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); setRows([]); }
  }
  React.useEffect(() => { load(); }, []);

  const matches = (r) => { const n = q.trim().toLowerCase(); if (!n) return true; return [r.name, r.refNo, r.title, r.status].some((f) => String(f || "").toLowerCase().includes(n)); };
  // ตัวกรองรับสินค้า = เฉพาะ PO (รายการอื่นไม่ใช่ของ) → เปิดตัวกรองแล้วโชว์เฉพาะ PO ที่ตรงสถานะ
  const recvOk = (r) => recvF === "all" || (r.type === "po" && (recvF === "received" ? r.received : !r.received));
  const shown = React.useMemo(() => (rows || []).filter((r) => matches(r) && recvOk(r)), [rows, q, recvF]);
  const poRecvCount = (v) => (rows || []).filter((r) => r.type === "po" && matches(r) && (v === "received" ? r.received : !r.received)).length;

  // KPIs
  const total = shown.reduce((a, r) => a + r.amount, 0);
  const sumOf = (k) => shown.filter((r) => r.type === k).reduce((a, r) => a + r.amount, 0);
  const credCount = new Set(shown.map((r) => r.name)).size;
  const over30 = shown.filter((r) => (r.days || 0) > 30).reduce((a, r) => a + r.amount, 0);
  const dueSoon = shown.filter((r) => r.dueDate && r.dueDate <= today).reduce((a, r) => a + r.amount, 0);   // เลย/ถึงกำหนดจ่ายแล้ว

  const byAge = React.useMemo(() => {
    const m = {}; AGES.forEach((a) => (m[a.key] = []));
    shown.slice().sort((a, b) => (a.days == null ? -1 : b.days == null ? 1 : b.days - a.days)).forEach((r) => m[r.age].push(r));
    return m;
  }, [shown]);

  const byType = React.useMemo(() => {
    const m = {}; TYPES.forEach((t) => (m[t.key] = []));
    shown.forEach((r) => (m[r.type] = m[r.type] || []).push(r));
    return m;
  }, [shown]);

  // รวมตามเจ้าหนี้ (ผู้ขาย/ทีมช่าง/ผู้ขอเบิก)
  const byCreditor = React.useMemo(() => {
    const m = {};
    shown.forEach((r) => {
      const c = m[r.name] || (m[r.name] = { name: r.name, total: 0, worstDays: 0, items: [] });
      c.total += r.amount; c.items.push(r);
      if ((r.days || 0) > c.worstDays) c.worstDays = r.days || 0;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [shown]);

  function exportCsv() {
    if (!shown.length) return flash("ไม่มีข้อมูลให้ส่งออก", true);
    const headers = ["ประเภท", "เอกสาร", "เจ้าหนี้/ทีม", "รายละเอียด", "ยอดค้างจ่าย", "วันที่เอกสาร", "ค้างมา(วัน)", "สถานะ"];
    const data = shown.map((r) => [TYPE[r.type]?.label || r.type, r.refNo, r.name, r.title || "", r.amount, r.date || "", r.days ?? "", r.status]);
    downloadCsv(`ค้างจ่าย-${today}`, headers, data);
  }

  // ปุ่ม "ไปจัดการ" — เด้งไปหน้าที่ใช้จ่ายจริงของแต่ละประเภท
  function openRow(r) {
    if (r.type === "po" && onOpenPo) return onOpenPo(r.refNo);
    if (r.type === "expense" && onGoExpenses) return onGoExpenses();
    if ((r.type === "payout" || r.type === "labor") && onGoSub) return onGoSub();
  }

  function Row({ r, showType }) {
    const t = TYPE[r.type];
    return (
      <div className="ar-row">
        <div className="ar-row-main">
          {showType && <span className="ar-dot" style={{ background: t.color }} />}
          {r.date && <span className="ar-due" style={{ minWidth: 82, whiteSpace: "nowrap" }} title="วันที่สั่ง/วันที่เอกสาร">📅 {thDate(r.date)}</span>}
          <b className="ar-inv">{r.refNo}</b>
          <span className="ar-cust">{r.name}{r.title ? <span style={{ color: "var(--ink-3)", fontWeight: 400 }}> · {r.title}</span> : null}</span>
          <span className="ar-owed">{fmtBaht(r.amount)}</span>
        </div>
        <div className="ar-row-sub">
          <span className="ar-due">
            {r.date ? (r.days > 0 ? <b style={{ color: r.days > 30 ? "#dc2626" : t.color }}>ค้างมา {r.days} วัน</b> : "สั่งวันนี้") : "ไม่ระบุวันที่"}
            {r.dueDate && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: r.dueDate <= today ? "#b91c1c" : "#0369a1", background: r.dueDate <= today ? "#fee2e2" : "#e0f2fe", borderRadius: 8, padding: "2px 8px" }} title="วันที่ตั้งใจจะจ่าย (จากใบเบิก)">{r.dueDate <= today ? "⚠️ ถึงกำหนดจ่าย" : "🗓 จ่าย"} {thDate(r.dueDate)}</span>}
            <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: t.color, background: t.bg, borderRadius: 8, padding: "2px 8px" }}>{r.status}</span>
          </span>
          <span className="ar-acts">
            {r.type === "po" && r.expenseId && onGoExpenses && (
              <button className="btn-ghost sm" title="เปิดใบเบิกจ่าย/ใบจ่ายที่ผูกกับ PO นี้" onClick={() => onGoExpenses(r.refNo)}>🧾 ดูใบจ่าย</button>
            )}
            <button className="btn-ghost sm" onClick={() => openRow(r)}><UIcon name="clipboard" size={13} /> ไปจัดการ</button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">ค้างจ่าย <span className="page-title-en">Payables</span></h1>
          <p className="page-sub">เงินที่เรายังไม่ได้จ่าย: ผู้ขาย (PO) · เบิกจ่ายรอจ่าย · ค่าแรงช่างซัพ — ตัวเลขชุดเดียวกับการ์ด "ยอดค้างจ่าย" บนแดชบอร์ด</p></div>
        <div className="cat-head-actions" style={{ gap: 8 }}>
          <div className="seg">
            <button className={"seg-btn" + (view === "type" ? " on" : "")} onClick={() => setView("type")}>ตามประเภท</button>
            <button className={"seg-btn" + (view === "age" ? " on" : "")} onClick={() => setView("age")}>ตามอายุ</button>
            <button className={"seg-btn" + (view === "creditor" ? " on" : "")} onClick={() => setView("creditor")}>ตามเจ้าหนี้</button>
          </div>
          <button className="btn-ghost sm" onClick={exportCsv}>⬇ Export</button>
          <button className="btn-ghost sm" onClick={load}>🔄 รีเฟรช</button>
        </div>
      </div>

      <div className="kpi-grid jp-kpi">
        <div className="stat-card"><div className="stat-val" style={{ color: "#dc2626" }}>{fmtBaht(total)}</div><div className="stat-label">ยอดค้างจ่ายทั้งหมด</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#7c3aed" }}>{fmtBaht(sumOf("po"))}</div><div className="stat-label">ค่าสินค้า (PO)</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#d97706" }}>{fmtBaht(sumOf("expense"))}</div><div className="stat-label">เบิกจ่ายรอจ่าย</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: "#0369a1" }}>{fmtBaht(sumOf("payout") + sumOf("labor"))}</div><div className="stat-label">ค่าแรงช่างซัพ</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: over30 ? "#dc2626" : "var(--ink)" }}>{fmtBaht(over30)}</div><div className="stat-label">ค้างเกิน 30 วัน{dueSoon ? ` · ถึงกำหนด ${fmtBaht(dueSoon)}` : ""}</div></div>
      </div>

      {totals && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: "var(--surface-2,#f3f7f8)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 14 }}>
        <b>สรุปสุทธิ:</b>
        <span>📥 ค้างรับ <b style={{ color: "#1d4ed8" }}>{fmtBaht(totals.receivable)}</b></span><span style={{ color: "var(--ink-3)" }}>−</span>
        <span>📤 ค้างจ่าย <b style={{ color: "#dc2626" }}>{fmtBaht(totals.payable)}</b></span><span style={{ color: "var(--ink-3)" }}>=</span>
        <span>สุทธิ <b style={{ color: (totals.receivable - totals.payable) >= 0 ? "var(--up)" : "var(--down)" }}>{fmtBaht(totals.receivable - totals.payable)}</b></span>
        <span className="jo-dim" style={{ fontSize: 12 }}>{(totals.receivable - totals.payable) >= 0 ? "· เก็บได้มากกว่าต้องจ่าย" : "· ต้องจ่ายมากกว่าจะเก็บได้ — ระวังเงินตึง"}</span>
      </div>}

      <FilterBar id="payables" count={(q ? 1 : 0) + (recvF !== "all" ? 1 : 0)} resultCount={shown.length} resultLabel="รายการ">
        <div className="cat-search" style={{ maxWidth: 380, marginBottom: 12 }}>
          <UIcon name="search" size={16} color="var(--ink-3)" />
          <input placeholder="ค้นหา ผู้ขาย / เลขเอกสาร / ทีม" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="cat-filter">
          <span style={{ fontSize: 12.5, color: "var(--ink-3)", alignSelf: "center", marginRight: 4 }}>รับสินค้า:</span>
          {[["all", "ทั้งหมด"], ["received", "รับของแล้ว"], ["pending", "ยังไม่รับของ"]].map(([v, l]) => (
            <button key={v} className={"cat-chip" + (recvF === v ? " on" : "")} onClick={() => setRecvF(v)}
              style={recvF === v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{l}{v !== "all" ? ` (${poRecvCount(v)})` : ""}</button>
          ))}
        </div>
      </FilterBar>

      {rows === null ? <div className="empty">กำลังโหลด…</div>
        : shown.length === 0 ? <div className="empty" style={{ padding: 40 }}>🎉 ไม่มียอดค้างจ่าย — จ่ายครบทุกรายการแล้ว</div>
        : view === "type" ? (
          <div className="ar-buckets">
            {TYPES.map((t) => {
              const list = byType[t.key] || [];
              if (!list.length) return null;
              const sum = list.reduce((a, r) => a + r.amount, 0);
              return (
                <div key={t.key} className="ar-bucket card">
                  <div className="ar-bucket-head" style={{ borderLeft: `5px solid ${t.color}` }}>
                    <span className="ar-bucket-label" style={{ color: t.color }}>{t.label}</span>
                    <span className="ar-bucket-cnt">{list.length} รายการ</span>
                    <span className="ar-bucket-sum" style={{ color: t.color }}>{fmtBaht(sum)}</span>
                  </div>
                  {list.map((r, i) => <Row key={r.type + r.refNo + i} r={r} showType />)}
                </div>
              );
            })}
          </div>
        ) : view === "age" ? (
          <div className="ar-buckets">
            {AGES.map((a) => {
              const list = byAge[a.key] || [];
              if (!list.length) return null;
              const sum = list.reduce((s, r) => s + r.amount, 0);
              return (
                <div key={a.key} className="ar-bucket card">
                  <div className="ar-bucket-head" style={{ borderLeft: `5px solid ${a.color}` }}>
                    <span className="ar-bucket-label" style={{ color: a.color }}>{a.label}</span>
                    <span className="ar-bucket-cnt">{list.length} รายการ</span>
                    <span className="ar-bucket-sum" style={{ color: a.color }}>{fmtBaht(sum)}</span>
                  </div>
                  {list.map((r, i) => <Row key={r.type + r.refNo + i} r={r} showType />)}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="ar-custs">
            {byCreditor.map((c) => {
              const open = openCred === c.name;
              const warn = c.worstDays > 30;
              return (
                <div key={c.name} className="ar-cust-card card">
                  <button className="ar-cust-head" onClick={() => setOpenCred(open ? null : c.name)}>
                    <span className="ar-dot" style={{ background: warn ? "#dc2626" : "#0369a1" }} />
                    <span className="ar-cust-name">{c.name}</span>
                    <span className="ar-cust-meta">{c.items.length} รายการ{c.worstDays > 0 ? ` · ค้างนานสุด ${c.worstDays} วัน` : ""}</span>
                    <span className="ar-cust-total" style={{ color: warn ? "#dc2626" : "var(--ink)" }}>{fmtBaht(c.total)}</span>
                    <UIcon name="chevR" size={15} style={{ transform: open ? "rotate(90deg)" : "none", color: "var(--ink-3)" }} />
                  </button>
                  {open && <div className="ar-cust-invs">{c.items.map((r, i) => <Row key={r.type + r.refNo + i} r={r} showType />)}</div>}
                </div>
              );
            })}
          </div>
        )}

      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
