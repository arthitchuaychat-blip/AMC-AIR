import React from "react";
import { listMaterials, listCategories, listStockCounts, createStockCount, getStockCount, getStockCountItems, saveStockCountCounts, applyStockCount, deleteStockCount } from "../lib/api";
import { confirmDialog } from "./ConfirmDialog";
import { matchText, fmtBaht } from "../lib/format";
import { UIcon } from "../icons";

const CAN_EDIT = ["admin", "exec", "stock"]; // ผู้ที่กดอัพเดท/แก้รอบนับได้ (ตรงกับ RLS ใน migration 086)
const fmtNum = (n) => { const v = Number(n) || 0; return Number.isInteger(v) ? String(v) : v.toFixed(2); };
const thDate = (s) => new Date(s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

export default function StockCount({ role }) {
  const canEdit = CAN_EDIT.includes(role);
  const [mats, setMats] = React.useState([]);
  const [cats, setCats] = React.useState([]);
  const [sessions, setSessions] = React.useState([]);
  const [openId, setOpenId] = React.useState(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 2800); };
  const matByCode = React.useMemo(() => Object.fromEntries(mats.map((m) => [m.code, m])), [mats]);

  async function loadBase() {
    setLoading(true);
    try { const [mm, cc, ss] = await Promise.all([listMaterials(), listCategories(), listStockCounts()]); setMats(mm); setCats(cc); setSessions(ss); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    setLoading(false);
  }
  React.useEffect(() => { loadBase(); }, []);

  if (openId) return <CountSession id={openId} canEdit={canEdit} matByCode={matByCode} onBack={() => { setOpenId(null); loadBase(); }} flash={flash} toast={toast} />;

  return (
    <div className="adm">
      <div className="adm-head">
        <div><h1 className="page-title">นับสต๊อก <span className="page-title-en">Stock Count</span></h1>
          <p className="page-sub">เทียบยอดในระบบ vs นับได้จริง · ปรับยอดตามที่นับ · เก็บประวัติตรวจย้อนหลัง</p></div>
        {canEdit && <div className="cat-head-actions"><button className="btn-primary" onClick={() => setNewOpen(true)}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เริ่มรอบนับใหม่</button></div>}
      </div>
      {loading ? <div className="empty">กำลังโหลด…</div> : (
        <div className="job-cards">
          {sessions.length === 0 && <div className="empty">ยังไม่มีรอบนับ{canEdit ? ' — กด "เริ่มรอบนับใหม่"' : ""}</div>}
          {sessions.map((s) => <SessionCard key={s.id} s={s} onOpen={() => setOpenId(s.id)} canEdit={canEdit} onDeleted={loadBase} flash={flash} />)}
        </div>
      )}
      {newOpen && <NewCountModal mats={mats} cats={cats} onClose={() => setNewOpen(false)} onCreated={(id) => { setNewOpen(false); loadBase(); setOpenId(id); }} flash={flash} />}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}

function SessionCard({ s, onOpen, canEdit, onDeleted, flash }) {
  async function del(e) {
    e.stopPropagation();
    if (!await confirmDialog(`ลบรอบนับ ${s.count_no}?`)) return;
    try { await deleteStockCount(s.id); flash("ลบแล้ว"); onDeleted(); } catch (err) { flash("ลบไม่สำเร็จ: " + (err.message || err), true); }
  }
  return (
    <div className="card job-card">
      <div className="job-card-head jo-card-head" style={{ cursor: "pointer" }} onClick={onOpen}>
        <div className="job-card-id"><span className="job-no">{s.count_no}</span>
          {s.status === "applied" ? <span className="job-badge b-green">อัพเดทแล้ว</span> : <span className="job-badge b-amber">ร่าง</span>}</div>
        <div className="job-card-meta">
          <div className="jcm-title">{s.note || "นับสต๊อก"}</div>
          <div className="jcm-by">
            <span>นับแล้ว {s.countedItems}/{s.totalItems} รายการ</span>
            {s.over > 0 && <span style={{ color: "#16a34a" }}>▲ เกิน {s.over}</span>}
            {s.short > 0 && <span style={{ color: "#dc2626" }}>▼ ขาด {s.short}</span>}
            <span>{thDate(s.created_at)}{s.countedByName ? ` · ${s.countedByName}` : ""}</span>
          </div>
        </div>
      </div>
      {canEdit && s.status !== "applied" && <div className="job-lines"><div className="job-actions">
        <button className="btn-ghost sm danger" onClick={del}><UIcon name="trash" size={14} /> ลบรอบนับ</button></div></div>}
    </div>
  );
}

function NewCountModal({ mats, cats, onClose, onCreated, flash }) {
  const [note, setNote] = React.useState("");
  const [mode, setMode] = React.useState("all"); // all | cats
  const [selCats, setSelCats] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const catList = cats.filter((c) => mats.some((m) => m.cat === c.id));
  const chosen = Object.keys(selCats).filter((k) => selCats[k]);
  const codes = mode === "all" ? mats.map((m) => m.code) : mats.filter((m) => chosen.includes(m.cat)).map((m) => m.code);

  async function create() {
    if (!codes.length) return flash("ยังไม่ได้เลือกสินค้าที่จะนับ", true);
    setBusy(true);
    try { const id = await createStockCount({ note, codes }); onCreated(id); }
    catch (e) { flash("สร้างไม่สำเร็จ: " + (e.message || e) + " (รัน 086_stock_count.sql แล้วหรือยัง?)", true); setBusy(false); }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <div className="modal-head"><div className="modal-title">📦 เริ่มรอบนับใหม่</div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button></div>
        <div className="modal-body">
          <label className="fld"><span>โน้ต/หมายเหตุ (ไม่บังคับ)</span>
            <input className="inp" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น นับสต๊อกปลายเดือน มิ.ย." /></label>
          <div className="fld" style={{ marginTop: 10 }}><span>ขอบเขตการนับ</span>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <button className={"cat-chip" + (mode === "all" ? " on" : "")} onClick={() => setMode("all")} style={mode === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทั้งคลัง ({mats.length})</button>
              <button className={"cat-chip" + (mode === "cats" ? " on" : "")} onClick={() => setMode("cats")} style={mode === "cats" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>เลือกหมวด</button>
            </div>
          </div>
          {mode === "cats" && (
            <div className="fld" style={{ marginTop: 8 }}>
              <div className="sc-catgrid">
                {catList.map((c) => { const n = mats.filter((m) => m.cat === c.id).length; return (
                  <label key={c.id} className="sc-catrow">
                    <input type="checkbox" checked={!!selCats[c.id]} onChange={(e) => setSelCats((s) => ({ ...s, [c.id]: e.target.checked }))} />
                    <span style={{ flex: 1 }}>{c.name_th}</span><span className="jo-dim">{n}</span>
                  </label>
                ); })}
              </div>
            </div>
          )}
          <button className="btn-primary" style={{ width: "100%", marginTop: 14 }} disabled={busy || !codes.length} onClick={create}>
            <UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> เริ่มนับ {codes.length} รายการ
          </button>
        </div>
      </div>
    </div>
  );
}

function CountSession({ id, canEdit, matByCode, onBack, flash, toast }) {
  const [sess, setSess] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const [counts, setCounts] = React.useState({});
  const [q, setQ] = React.useState("");
  const [catF, setCatF] = React.useState("all");
  const [busy, setBusy] = React.useState(false);
  const applied = sess?.status === "applied";
  const editable = canEdit && !applied;

  async function load() {
    try {
      const [s, its] = await Promise.all([getStockCount(id), getStockCountItems(id)]);
      setSess(s); setItems(its);
      const c = {}; its.forEach((it) => { c[it.material_code] = it.counted_qty == null ? "" : String(it.counted_qty); });
      setCounts(c);
    } catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
  }
  React.useEffect(() => { load(); }, [id]);

  const rows = items.map((it) => {
    const m = matByCode[it.material_code] || {};
    const system = applied ? (Number(it.system_qty) || 0) : (Number(m.stock) || 0);
    const cs = counts[it.material_code];
    const counted = (cs === "" || cs == null) ? null : Number(cs);
    const diff = applied ? (it.diff == null ? null : Number(it.diff)) : (counted == null ? null : Math.round((counted - system) * 100) / 100);
    return { code: it.material_code, name: m.th || it.material_code, unit: m.unit || "", cat: m.cat, catName: m.catName || m.cat,
      cost: Number(m.cost) || Number(it.unit_cost) || 0, system, counted, countedStr: cs ?? "", diff };
  });
  const shown = rows.filter((r) => (catF === "all" || r.cat === catF) && (q === "" || matchText(q, r.code, r.name)));
  const countedRows = rows.filter((r) => r.counted != null);
  const overSum = countedRows.filter((r) => r.diff > 0).reduce((a, r) => a + r.diff, 0);
  const shortSum = countedRows.filter((r) => r.diff < 0).reduce((a, r) => a + r.diff, 0);
  const diffValue = countedRows.reduce((a, r) => a + (r.diff || 0) * r.cost, 0);
  const catChips = [...new Map(rows.map((r) => [r.cat, r.catName])).entries()].filter(([c]) => c);

  async function saveDraft() {
    setBusy(true);
    try { await saveStockCountCounts(id, counts); flash("บันทึกร่างแล้ว ✓"); await load(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }
  async function apply() {
    if (!countedRows.length) return flash("ยังไม่ได้กรอกยอดนับ", true);
    const nz = countedRows.filter((r) => r.diff !== 0).length;
    if (!await confirmDialog({ title: "อัพเดทสต๊อกตามที่นับ?", message: `จะปรับยอด ${nz} รายการที่มีส่วนต่าง ให้ตรงกับที่นับได้จริง\n(บันทึกเป็นรายการ "ปรับยอด" ในคลัง · ตรวจย้อนหลังได้ · รอบนี้จะถูกล็อก)`, danger: true, confirmText: "อัพเดทสต๊อก" })) return;
    setBusy(true);
    try { await saveStockCountCounts(id, counts); const r = await applyStockCount(id); flash(`อัพเดทสต๊อกแล้ว ✓ ปรับ ${r.adjusted} รายการ`); await load(); }
    catch (e) { flash("อัพเดทไม่สำเร็จ: " + (e.message || e), true); }
    setBusy(false);
  }

  if (!sess) return <div className="adm"><div className="empty">กำลังโหลด…</div></div>;
  return (
    <div className="adm">
      <div className="adm-head"><div>
        <button className="btn-ghost sm" onClick={onBack}>‹ ย้อนกลับ</button>
        <h1 className="page-title" style={{ marginTop: 6 }}>{sess.count_no} {applied ? <span className="job-badge b-green">อัพเดทแล้ว 🔒</span> : <span className="job-badge b-amber">ร่าง</span>}</h1>
        <p className="page-sub">{sess.note || "นับสต๊อก"}{applied && sess.applied_at ? ` · อัพเดทเมื่อ ${new Date(sess.applied_at).toLocaleString("th-TH")}` : ""}</p>
      </div></div>

      <div className="card sc-summary">
        <div><div className="jo-dim">นับแล้ว</div><b>{countedRows.length}/{rows.length}</b></div>
        <div><div className="jo-dim">เกิน (นับได้มากกว่า)</div><b style={{ color: "#16a34a" }}>+{fmtNum(overSum)}</b></div>
        <div><div className="jo-dim">ขาด (นับได้น้อยกว่า)</div><b style={{ color: "#dc2626" }}>{fmtNum(shortSum)}</b></div>
        <div><div className="jo-dim">มูลค่าส่วนต่างสุทธิ</div><b style={{ color: diffValue < 0 ? "#dc2626" : "#16a34a" }}>{fmtBaht(diffValue)}</b></div>
      </div>

      {catChips.length > 1 && (
        <div className="cat-filter">
          <button className={"cat-chip" + (catF === "all" ? " on" : "")} onClick={() => setCatF("all")} style={catF === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทุกหมวด</button>
          {catChips.map(([c, cn]) => <button key={c} className={"cat-chip" + (catF === c ? " on" : "")} onClick={() => setCatF(c)} style={catF === c ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{cn}</button>)}
        </div>
      )}
      <div className="cat-search" style={{ marginBottom: 12 }}><UIcon name="search" size={16} color="var(--ink-3)" /><input placeholder="ค้นหารหัส / ชื่อสินค้า" value={q} onChange={(e) => setQ(e.target.value)} /></div>

      <div className="card" style={{ overflowX: "auto", padding: 0 }}>
        <table className="sc-table">
          <thead><tr><th>รหัส</th><th>สินค้า</th><th>หน่วย</th><th className="num">ยอดในระบบ</th><th className="num">นับได้จริง</th><th className="num">ส่วนต่าง</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.code} className={r.counted != null && r.diff !== 0 ? "sc-diffrow" : ""}>
                <td className="mono">{r.code}</td>
                <td>{r.name}</td>
                <td>{r.unit}</td>
                <td className="num">{fmtNum(r.system)}</td>
                <td className="num">
                  {editable
                    ? <input className="inp sc-inp" type="number" inputMode="decimal" value={r.countedStr} placeholder="—"
                        onChange={(e) => setCounts((c) => ({ ...c, [r.code]: e.target.value }))} />
                    : (r.counted == null ? <span className="jo-dim">—</span> : fmtNum(r.counted))}
                </td>
                <td className="num">
                  {r.counted == null ? <span className="jo-dim">—</span>
                    : r.diff > 0 ? <span className="sc-over">▲ +{fmtNum(r.diff)}</span>
                    : r.diff < 0 ? <span className="sc-short">▼ {fmtNum(r.diff)}</span>
                    : <span className="jo-dim">✓ ตรง</span>}
                </td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={6} className="empty" style={{ padding: 20 }}>ไม่พบรายการ</td></tr>}
          </tbody>
        </table>
      </div>

      {editable && (
        <div className="job-actions" style={{ marginTop: 14, justifyContent: "flex-end" }}>
          <button className="btn-ghost" disabled={busy} onClick={saveDraft}><UIcon name="clipboard" size={15} /> บันทึกร่าง</button>
          <button className="btn-primary" disabled={busy} onClick={apply}><UIcon name="check" size={15} color="#fff" strokeWidth={2.4} /> อัพเดทสต๊อกตามที่นับ</button>
        </div>
      )}
      {toast && <div className={"toast" + (toast.bad ? " bad" : "")}>{toast.m}</div>}
    </div>
  );
}
