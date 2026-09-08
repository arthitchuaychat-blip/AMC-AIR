import React from "react";
import { listRecurringBills, saveRecurringBill, deleteRecurringBill, payRecurringBill, listAccounts } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";
import { can } from "../lib/permissions";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const THMON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const CAT_ICON = { "ค่าโทรศัพท์": "📱", "อินเทอร์เน็ต": "🌐", "AI": "🤖", "พื้นที่เก็บข้อมูล": "☁️", "Streaming": "🎬" };

// สถานะงวดปัจจุบัน
function billStatus(b) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth() + 1;
  const yearly = b.period === "yearly";
  const cycleKey = yearly ? String(y) : `${y}-${String(m).padStart(2, "0")}`;
  const paid = (b.last_paid_ym || "") >= cycleKey;
  const dueThisMonth = yearly ? (Number(b.due_month) || 1) === m : true;
  return { cycleKey, paid, dueThisMonth, yearly };
}

export default function RecurringBills({ role, onGoExpenses, onGoCashflow }) {
  const canEdit = can(role, "loans", "edit");
  const [rows, setRows] = React.useState([]);
  const [accounts, setAccounts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [needMig, setNeedMig] = React.useState(false);
  const [edit, setEdit] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 3000); };

  async function load(silent) {
    if (!silent) setLoading(true);
    try { const r = await listRecurringBills(); setRows(r.rows); setNeedMig(!!r.needMigration); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    if (!silent) setLoading(false);
  }
  React.useEffect(() => { load(); listAccounts().then((a) => setAccounts((a || []).filter((x) => x.active !== false))).catch(() => {}); }, []);

  const active = rows.filter((b) => b.active !== false);
  const perMonth = r2(active.filter((b) => b.period !== "yearly").reduce((s, b) => s + (Number(b.amount) || 0), 0));
  const perYearOnce = r2(active.filter((b) => b.period === "yearly").reduce((s, b) => s + (Number(b.amount) || 0), 0));
  const yearTotal = r2(perMonth * 12 + perYearOnce);
  const dueNow = active.filter((b) => { const s = billStatus(b); return s.dueThisMonth && !s.paid; });

  async function doPay(b) {
    const s = billStatus(b);
    const ok = await confirmDialog({ title: `จ่าย ${b.name}${b.provider ? " · " + b.provider : ""}?`, message: `งวด ${s.cycleKey} · ${fmtBaht(b.amount)}${b.pay_account ? "\nจ่ายผ่าน " + b.pay_account : ""}\nบันทึกเป็น "จ่ายแล้ว" + ตั้งใบเบิก`, confirmText: "✓ จ่ายแล้ว" });
    if (!ok) return;
    setBusy(true);
    try { await payRecurringBill(b.id, s.cycleKey); flash(`บันทึกจ่าย ${b.name} งวด ${s.cycleKey} แล้ว ✓`); await load(true); }
    catch (e) { flash("ไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function doDelete(b) {
    if (!await confirmDialog({ title: `ลบรายจ่ายประจำ "${b.name}"?`, confirmText: "ลบ" })) return;
    try { await deleteRecurringBill(b.id); flash("ลบแล้ว"); await load(true); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }

  // จัดกลุ่มตามหมวด
  const byCat = {};
  active.forEach((b) => { (byCat[b.category || "อื่นๆ"] = byCat[b.category || "อื่นๆ"] || []).push(b); });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div><div className="muted" style={{ fontSize: 13 }}>บิลสมัครสมาชิก/บริการรายเดือน-รายปี · ประมาณการล่วงหน้าเข้ากระแสเงินสด + เตือนจ่าย</div></div>
        {canEdit && <button className="btn primary" onClick={() => setEdit(blank())}>+ เพิ่มรายจ่ายประจำ</button>}
      </div>

      {needMig && <div className="card" style={{ padding: 14, borderColor: "#b4530955", background: "#b4530912", marginTop: 12 }}>⚠️ ต้องรัน <b>migration 245</b> ก่อน (สร้างตาราง recurring_bills)</div>}

      {loading ? <div className="muted" style={{ padding: 30, textAlign: "center" }}>กำลังโหลด…</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, margin: "16px 0" }}>
          <Card k="📅 จ่ายรวม/เดือน" v={fmtBaht(perMonth)} sub={`${active.filter((b) => b.period !== "yearly").length} รายการ`} accent />
          <Card k="🗓 รายปี (ก้อนเดียว)" v={fmtBaht(perYearOnce)} sub={`${active.filter((b) => b.period === "yearly").length} รายการ`} />
          <Card k="💰 รวมทั้งปี" v={fmtBaht(yearTotal)} sub="ประมาณการ" />
          <Card k="⏰ ครบกำหนดเดือนนี้" v={`${dueNow.length} รายการ`} sub={dueNow.length ? fmtBaht(dueNow.reduce((s, b) => s + Number(b.amount || 0), 0)) : "—"} warn={dueNow.length > 0} />
        </div>

        {active.length === 0 && !needMig && <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--muted,#889)" }}>ยังไม่มีรายจ่ายประจำ {canEdit && <>— กด <b>+ เพิ่มรายจ่ายประจำ</b></>}</div>}

        {Object.entries(byCat).map(([cat, bills]) => <div key={cat} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 2px", color: "var(--ink,#0e1b24)" }}>{CAT_ICON[cat] || "•"} {cat} <span style={{ fontWeight: 400, color: "var(--muted,#889)" }}>· {fmtBaht(r2(bills.reduce((s, b) => s + (b.period === "yearly" ? 0 : Number(b.amount) || 0), 0)))}/เดือน</span></div>
          <div style={{ display: "grid", gap: 8 }}>
            {bills.map((b) => <BillRow key={b.id} b={b} onPay={() => doPay(b)} onEdit={() => setEdit({ ...b })} canEdit={canEdit} busy={busy} />)}
          </div>
        </div>)}
      </>}

      {edit && <BillForm bill={edit} accounts={accounts} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load(true); flash("บันทึกแล้ว ✓"); }} onDelete={edit.id ? () => { doDelete(edit); setEdit(null); } : null} flash={flash} />}
      {toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: toast.bad ? "#b42318" : "#0f766e", color: "#fff", padding: "10px 18px", borderRadius: 10, zIndex: 60, fontSize: 14, boxShadow: "0 6px 20px #0004" }}>{toast.m}</div>}
    </div>
  );
}

function Card({ k, v, sub, accent, warn }) {
  return <div className="card" style={{ padding: "14px 16px", ...(accent ? { borderColor: "var(--teal,#0f766e)" } : warn ? { borderColor: "#b45309" } : {}) }}>
    <div style={{ fontSize: 12.5, color: "var(--muted,#667)" }}>{k}</div>
    <div style={{ fontSize: 21, fontWeight: 700, marginTop: 5, letterSpacing: "-.02em", color: warn ? "#b45309" : "inherit" }}>{v}</div>
    {sub && <div style={{ fontSize: 12, color: "var(--muted,#889)", marginTop: 2 }}>{sub}</div>}
  </div>;
}

function BillRow({ b, onPay, onEdit, canEdit, busy }) {
  const s = billStatus(b);
  const per = b.period === "yearly" ? `ปี · ${THMON[(Number(b.due_month) || 1) - 1]} ${b.due_day}` : `เดือน · ทุกวันที่ ${b.due_day}`;
  return <div className="card" style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: b.active === false ? 0.55 : 1 }}>
    <div style={{ flex: "1 1 200px", minWidth: 0, cursor: canEdit ? "pointer" : "default" }} onClick={canEdit ? onEdit : undefined}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}{b.provider ? " · " + b.provider : ""} <span style={{ fontSize: 11, fontWeight: 400, color: b.entity === "personal" ? "#6d28d9" : "#1d4ed8" }}>{b.entity === "personal" ? "👤 บุคคล" : "🏢 บริษัท"}</span></div>
      <div style={{ fontSize: 11.5, color: "var(--muted,#889)" }}>{[b.ref_no, per, b.location, b.pay_account ? "💳 " + b.pay_account : null].filter(Boolean).join(" · ")}</div>
    </div>
    <div style={{ textAlign: "right", minWidth: 90 }}><div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtBaht(b.amount)}</div><div style={{ fontSize: 10.5, color: "var(--muted,#889)" }}>{b.period === "yearly" ? "/ปี" : "/เดือน"}</div></div>
    <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: 6 }}>
      {s.paid ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: "#137a5416", color: "var(--green,#137a54)" }}>✓ จ่ายแล้ว ({s.cycleKey})</span>
        : s.dueThisMonth ? <span style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 99, background: "#b4530915", color: "#b45309" }}>ครบกำหนด</span>
        : <span style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 99, background: "var(--line,#eef)", color: "var(--muted,#667)" }}>{THMON[(Number(b.due_month) || 1) - 1]}</span>}
      {canEdit && !s.paid && <button className="btn sm" disabled={busy} onClick={onPay} title="บันทึกจ่ายงวดนี้">จ่าย</button>}
      {canEdit && <button className="btn-icon sm" onClick={onEdit} title="แก้ไข">✏️</button>}
    </div>
  </div>;
}

function blank() { return { name: "", provider: "", ref_no: "", period: "monthly", due_day: 1, due_month: "", amount: "", entity: "company", location: "", pay_account: "", category: "", active: true, note: "" }; }
const CATS = ["ค่าโทรศัพท์", "อินเทอร์เน็ต", "AI", "พื้นที่เก็บข้อมูล", "Streaming", "อื่นๆ"];
// ⚠️ ต้องอยู่นอก BillForm — ถ้าประกาศในฟังก์ชัน re-render จะสร้าง component ใหม่ทุกครั้ง → input เสียโฟกัส
const Row = ({ label, children }) => <label style={{ display: "block" }}><div style={{ fontSize: 12, color: "var(--muted,#778)", marginBottom: 3 }}>{label}</div>{children}</label>;

function BillForm({ bill, accounts, onClose, onSaved, onDelete, flash }) {
  const [f, setF] = React.useState(bill);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  async function save() {
    if (!f.name.trim()) return flash("ใส่ชื่อรายการ", true);
    if (!(Number(f.amount) > 0)) return flash("ใส่ยอดจ่าย", true);
    setBusy(true);
    try { await saveRecurringBill(f); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); setBusy(false); }
  }
  return <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 75, display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "auto", padding: "24px 12px" }} onClick={onClose}>
    <div className="card" style={{ maxWidth: 500, width: "100%", padding: 20 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h3 style={{ margin: 0 }}>{bill.id ? "แก้ไขรายจ่ายประจำ" : "เพิ่มรายจ่ายประจำ"}</h3><button className="btn-icon" onClick={onClose}>✕</button></div>
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="รายการ *"><input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น ค่าโทรศัพท์" /></Row>
          <Row label="เครือข่าย/ผู้ให้บริการ"><input className="inp" value={f.provider || ""} onChange={(e) => set("provider", e.target.value)} placeholder="เช่น Dtac / AIS / Netflix" /></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="หมวด"><input className="inp" list="rb-cats" value={f.category || ""} onChange={(e) => set("category", e.target.value)} placeholder="เลือก/พิมพ์หมวด" /><datalist id="rb-cats">{CATS.map((c) => <option key={c} value={c} />)}</datalist></Row>
          <Row label="หมายเลข/อ้างอิง"><input className="inp" value={f.ref_no || ""} onChange={(e) => set("ref_no", e.target.value)} placeholder="เบอร์/อีเมล" /></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="ยอดจ่าย *"><input className="inp" type="number" step="0.01" value={f.amount} onChange={(e) => set("amount", e.target.value)} /></Row>
          <Row label="รอบ"><select className="inp" value={f.period} onChange={(e) => set("period", e.target.value)}><option value="monthly">รายเดือน</option><option value="yearly">รายปี</option></select></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: f.period === "yearly" ? "1fr 1fr" : "1fr", gap: 10 }}>
          {f.period === "yearly" && <Row label="เดือนครบกำหนด"><select className="inp" value={f.due_month || ""} onChange={(e) => set("due_month", e.target.value)}><option value="">— เลือกเดือน —</option>{THMON.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}</select></Row>}
          <Row label="วันครบกำหนด"><input className="inp" type="number" min="1" max="31" value={f.due_day} onChange={(e) => set("due_day", e.target.value)} /></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="กิจการ"><select className="inp" value={f.entity} onChange={(e) => set("entity", e.target.value)}><option value="company">🏢 บริษัท</option><option value="personal">👤 บุคคล</option></select></Row>
          <Row label="สถานที่ (ถ้ามี)"><input className="inp" value={f.location || ""} onChange={(e) => set("location", e.target.value)} placeholder="Office / Studio" /></Row>
        </div>
        <Row label="วิธีจ่าย / บัตร-บัญชี"><input className="inp" list="rb-accts" value={f.pay_account || ""} onChange={(e) => set("pay_account", e.target.value)} placeholder="เช่น บัตรเครดิตกสิกร-4824" /><datalist id="rb-accts">{accounts.map((a) => <option key={a.id} value={a.name} />)}</datalist></Row>
        {bill.id && <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={f.active !== false} onChange={(e) => set("active", e.target.checked)} /> ใช้งานอยู่ (ยังจ่ายประจำ)</label>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        {onDelete && <button className="btn sm danger" onClick={onDelete} style={{ marginRight: "auto" }}>ลบ</button>}
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
    </div>
  </div>;
}
