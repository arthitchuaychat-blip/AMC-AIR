import React from "react";
import { listAssets, saveAsset, deleteAsset } from "../lib/api";
import { depreciation, scheduleByYear, ASSET_CATS, r2 } from "../lib/assets";
import { confirmDialog } from "./ConfirmDialog";
import { fmtBaht } from "../lib/format";
import { can } from "../lib/permissions";

const CAT_ICON = { "เครื่องมือช่าง": "🔨", "ครุภัณฑ์สำนักงาน": "🪑", "คอมพิวเตอร์/ไอที": "💻", "ยานพาหนะ": "🚗", "เครื่องจักร/อุปกรณ์": "⚙️", "อื่นๆ": "📦" };
const Row = ({ label, children }) => <label style={{ display: "block" }}><div style={{ fontSize: 12, color: "var(--muted,#778)", marginBottom: 3 }}>{label}</div>{children}</label>;

export default function Assets({ role, prefill, onConsumed }) {
  const canEdit = can(role, "assets", "edit");
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [needMig, setNeedMig] = React.useState(false);
  const [edit, setEdit] = React.useState(null);
  const [detail, setDetail] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const flash = (m, bad) => { setToast({ m, bad }); setTimeout(() => setToast(null), 3000); };

  async function load(silent) {
    if (!silent) setLoading(true);
    try { const r = await listAssets(); setRows(r.rows); setNeedMig(!!r.needMigration); }
    catch (e) { flash("โหลดไม่สำเร็จ: " + (e.message || e), true); }
    if (!silent) setLoading(false);
  }
  React.useEffect(() => { load(); }, []);
  // เปิดฟอร์มพร้อมข้อมูลจากใบเบิก (ขึ้นทะเบียนจากเบิกจ่าย)
  React.useEffect(() => { if (prefill) { setEdit({ ...blank(), ...prefill }); onConsumed && onConsumed(); } }, [prefill]); // eslint-disable-line

  const active = rows.filter((a) => a.active !== false && !a.disposed);
  const totCost = r2(active.reduce((s, a) => s + (Number(a.cost) || 0), 0));
  const totBook = r2(active.reduce((s, a) => s + depreciation(a).book, 0));
  const totAccum = r2(totCost - totBook);
  const perMonth = r2(active.reduce((s, a) => s + (depreciation(a).done ? 0 : depreciation(a).perMonth), 0));

  async function doDelete(a) {
    const reason = await confirmDialog({ title: `ลบสินทรัพย์ "${a.name}"?`, message: "ลบออกจากทะเบียนถาวร (ถ้าจำหน่ายแล้วให้ใช้ 'ตัดจำหน่าย' แทน)", confirmText: "ลบ", prompt: { label: "เหตุผล", required: true } });
    if (!reason) return;
    try { await deleteAsset(a.id); flash("ลบแล้ว"); await load(true); if (detail?.id === a.id) setDetail(null); }
    catch (e) { flash("ลบไม่สำเร็จ: " + (e.message || e), true); }
  }

  const byCat = {};
  active.forEach((a) => { (byCat[a.category || "อื่นๆ"] = byCat[a.category || "อื่นๆ"] || []).push(a); });

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div><h2 style={{ margin: 0 }}>🏗️ สินทรัพย์ / ครุภัณฑ์</h2><div className="muted" style={{ fontSize: 13 }}>ทะเบียนของมูลค่าสูง (เครื่องมือ/อุปกรณ์) + คิดค่าเสื่อมราคา + ผู้ถือครอง</div></div>
        {canEdit && <button className="btn primary" onClick={() => setEdit(blank())}>+ เพิ่มสินทรัพย์</button>}
      </div>

      {needMig && <div className="card" style={{ padding: 14, borderColor: "#b4530955", background: "#b4530912", marginTop: 12 }}>⚠️ ต้องรัน <b>migration 247</b> ก่อน (สร้างตาราง fixed_assets)</div>}

      {loading ? <div className="muted" style={{ padding: 30, textAlign: "center" }}>กำลังโหลด…</div> : <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 12, margin: "16px 0" }}>
          <Card k="💰 มูลค่าซื้อรวม" v={fmtBaht(totCost)} sub={`${active.length} รายการ`} />
          <Card k="📉 ค่าเสื่อมสะสม" v={fmtBaht(totAccum)} sub="ถึงปัจจุบัน" />
          <Card k="🏗️ มูลค่าคงเหลือ (ตามบัญชี)" v={fmtBaht(totBook)} accent />
          <Card k="🗓 ค่าเสื่อม/เดือน" v={fmtBaht(perMonth)} sub="รวมทุกชิ้น" />
        </div>

        {active.length === 0 && !needMig && <div className="card" style={{ padding: 30, textAlign: "center", color: "var(--muted,#889)" }}>ยังไม่มีสินทรัพย์ {canEdit && <>— กด <b>+ เพิ่มสินทรัพย์</b></>}</div>}

        {Object.entries(byCat).map(([cat, items]) => <div key={cat} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, margin: "6px 2px" }}>{CAT_ICON[cat] || "📦"} {cat} <span style={{ fontWeight: 400, color: "var(--muted,#889)" }}>· คงเหลือ {fmtBaht(r2(items.reduce((s, a) => s + depreciation(a).book, 0)))}</span></div>
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((a) => <AssetRow key={a.id} a={a} onOpen={() => setDetail(a)} onEdit={() => setEdit({ ...a })} canEdit={canEdit} />)}
          </div>
        </div>)}
      </>}

      {edit && <AssetForm asset={edit} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await load(true); flash("บันทึกแล้ว ✓"); }} onDelete={edit.id ? () => { doDelete(edit); setEdit(null); } : null} flash={flash} />}
      {detail && <AssetDetail a={detail} onClose={() => setDetail(null)} onEdit={canEdit ? () => { setDetail(null); setEdit({ ...detail }); } : null} />}
      {toast && <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: toast.bad ? "#b42318" : "#0f766e", color: "#fff", padding: "10px 18px", borderRadius: 10, zIndex: 60, fontSize: 14, boxShadow: "0 6px 20px #0004" }}>{toast.m}</div>}
    </div>
  );
}

function Card({ k, v, sub, accent }) {
  return <div className="card" style={{ padding: "14px 16px", ...(accent ? { borderColor: "var(--teal,#0f766e)" } : {}) }}>
    <div style={{ fontSize: 12.5, color: "var(--muted,#667)" }}>{k}</div>
    <div style={{ fontSize: 21, fontWeight: 700, marginTop: 5, letterSpacing: "-.02em" }}>{v}</div>
    {sub && <div style={{ fontSize: 12, color: "var(--muted,#889)", marginTop: 2 }}>{sub}</div>}
  </div>;
}

function AssetRow({ a, onOpen, onEdit, canEdit }) {
  const d = depreciation(a);
  const pct = d.depreciable > 0 ? Math.min(100, Math.round((d.accum / d.depreciable) * 100)) : 0;
  return <div className="card" style={{ padding: "11px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
    <div style={{ flex: "1 1 200px", minWidth: 0, cursor: "pointer" }} onClick={onOpen}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name} <span style={{ fontSize: 11, fontWeight: 400, color: a.entity === "personal" ? "#6d28d9" : "#1d4ed8" }}>{a.entity === "personal" ? "👤 บุคคล" : "🏢 บริษัท"}</span></div>
      <div style={{ fontSize: 11.5, color: "var(--muted,#889)" }}>{[a.holder ? "👤 " + a.holder : null, a.location, a.supplier, a.purchase_date ? "ซื้อ " + new Date(a.purchase_date + "T00:00:00").toLocaleDateString("th-TH", { month: "short", year: "2-digit" }) : null, `อายุ ${a.life_years} ปี`].filter(Boolean).join(" · ")}</div>
    </div>
    <div style={{ minWidth: 150 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted,#889)" }}><span>ทุน {fmtBaht(a.cost)}</span><span>{d.done ? "ครบ" : pct + "%"}</span></div>
      <div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", fontSize: 13.5 }}>{fmtBaht(d.book)} <span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted,#889)" }}>คงเหลือ</span></div>
      <div style={{ height: 6, borderRadius: 99, background: "var(--line,#e3e8ee)", overflow: "hidden", marginTop: 4 }}><div style={{ height: "100%", width: `${pct}%`, background: d.done ? "#b45309" : "var(--teal,#0f766e)", borderRadius: 99 }} /></div>
    </div>
    {canEdit && <button className="btn-icon sm" onClick={onEdit} title="แก้ไข">✏️</button>}
  </div>;
}

function AssetDetail({ a, onClose, onEdit }) {
  const d = depreciation(a);
  const sched = scheduleByYear(a);
  return <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 70, display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "auto", padding: "24px 12px" }} onClick={onClose}>
    <div className="card" style={{ maxWidth: 620, width: "100%", padding: 0, overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: "16px 18px", background: "var(--teal-soft,#0f766e12)", borderBottom: "1px solid var(--line,#e3e8ee)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div><div style={{ fontWeight: 700, fontSize: 16 }}>{CAT_ICON[a.category] || "📦"} {a.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted,#778)", marginTop: 2 }}>{[a.category, a.holder ? "ผู้ถือ " + a.holder : null, a.supplier, a.code].filter(Boolean).join(" · ")}</div></div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 12 }}>
          <Fact l="ราคาซื้อ" n={fmtBaht(d.cost)} />
          <Fact l="ค่าเสื่อมสะสม" n={fmtBaht(d.accum)} />
          <Fact l="มูลค่าคงเหลือ" n={fmtBaht(d.book)} />
          <Fact l="ค่าเสื่อม/เดือน" n={fmtBaht(d.perMonth)} />
          <Fact l="ครบอายุ" n={d.endDate ? d.endDate.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }) : "—"} />
        </div>
      </div>
      <div style={{ padding: "6px 16px 12px" }}>
        <div style={{ fontSize: 13, fontWeight: 600, margin: "8px 2px" }}>ตารางค่าเสื่อมราคา (เส้นตรง {a.life_years} ปี)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 380 }}>
            <thead><tr style={{ background: "var(--panel2,#f6f8fa)" }}>{["ปี", "ค่าเสื่อมปีนี้", "สะสม", "คงเหลือ"].map((h, i) => <th key={i} style={{ textAlign: i ? "right" : "left", padding: "7px 12px", color: "var(--muted,#778)", fontWeight: 600, fontSize: 11, borderBottom: "1px solid var(--line,#e3e8ee)" }}>{h}</th>)}</tr></thead>
            <tbody>{sched.map((r) => <tr key={r.year}><td style={{ padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)" }}>{r.year}</td>
              <td style={{ textAlign: "right", padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", fontVariantNumeric: "tabular-nums" }}>{fmtBaht(r.dep)}</td>
              <td style={{ textAlign: "right", padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", fontVariantNumeric: "tabular-nums", color: "var(--muted,#99a)" }}>{fmtBaht(r.accum)}</td>
              <td style={{ textAlign: "right", padding: "6px 12px", borderBottom: "1px solid var(--line,#eef)", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtBaht(r.book)}</td></tr>)}</tbody>
          </table>
        </div>
        {a.note && <div style={{ fontSize: 12.5, color: "var(--muted,#667)", marginTop: 8 }}>📝 {a.note}</div>}
        {onEdit && <div style={{ marginTop: 12 }}><button className="btn sm" onClick={onEdit}>✏️ แก้ไข</button></div>}
      </div>
    </div>
  </div>;
}
function Fact({ l, n }) { return <div><div style={{ fontSize: 11, color: "var(--muted,#889)" }}>{l}</div><div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 1, fontVariantNumeric: "tabular-nums" }}>{n}</div></div>; }

function blank() { return { name: "", category: "เครื่องมือช่าง", cost: "", salvage: "", life_years: 5, purchase_date: "", entity: "company", location: "", holder: "", supplier: "", code: "", note: "", disposed: false, active: true }; }

function AssetForm({ asset, onClose, onSaved, onDelete, flash }) {
  const [f, setF] = React.useState(asset);
  const [busy, setBusy] = React.useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const preview = React.useMemo(() => { try { return Number(f.cost) > 0 ? depreciation({ ...f, disposed: false }) : null; } catch { return null; } }, [f]);
  async function save() {
    if (!f.name.trim()) return flash("ใส่ชื่อสินทรัพย์", true);
    if (!(Number(f.cost) > 0)) return flash("ใส่ราคาซื้อ", true);
    setBusy(true);
    try { await saveAsset(f); onSaved(); }
    catch (e) { flash("บันทึกไม่สำเร็จ: " + (e.message || e), true); setBusy(false); }
  }
  return <div style={{ position: "fixed", inset: 0, background: "#0008", zIndex: 75, display: "flex", alignItems: "flex-start", justifyContent: "center", overflow: "auto", padding: "24px 12px" }} onClick={onClose}>
    <div className="card" style={{ maxWidth: 520, width: "100%", padding: 20 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><h3 style={{ margin: 0 }}>{asset.id ? "แก้ไขสินทรัพย์" : "เพิ่มสินทรัพย์"}</h3><button className="btn-icon" onClick={onClose}>✕</button></div>
      <div style={{ display: "grid", gap: 10 }}>
        <Row label="ชื่อสินทรัพย์ *"><input className="inp" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น สว่านโรตารี่ Bosch / เครื่องเชื่อม" /></Row>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="หมวด"><select className="inp" value={f.category} onChange={(e) => set("category", e.target.value)}>{ASSET_CATS.map((c) => <option key={c} value={c}>{CAT_ICON[c] || "📦"} {c}</option>)}</select></Row>
          <Row label="รหัสสินทรัพย์"><input className="inp" value={f.code || ""} onChange={(e) => set("code", e.target.value)} placeholder="ไม่บังคับ" /></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <Row label="ราคาซื้อ *"><input className="inp" type="number" value={f.cost} onChange={(e) => set("cost", e.target.value)} /></Row>
          <Row label="มูลค่าซาก"><input className="inp" type="number" value={f.salvage} onChange={(e) => set("salvage", e.target.value)} placeholder="0" /></Row>
          <Row label="อายุ (ปี)"><input className="inp" type="number" min="1" value={f.life_years} onChange={(e) => set("life_years", e.target.value)} /></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="วันที่ซื้อ"><input className="inp" type="date" value={f.purchase_date || ""} onChange={(e) => set("purchase_date", e.target.value)} /></Row>
          <Row label="กิจการ"><select className="inp" value={f.entity} onChange={(e) => set("entity", e.target.value)}><option value="company">🏢 บริษัท</option><option value="personal">👤 บุคคล</option></select></Row>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Row label="ผู้ถือครอง/รับผิดชอบ"><input className="inp" value={f.holder || ""} onChange={(e) => set("holder", e.target.value)} placeholder="ชื่อช่าง/พนักงาน" /></Row>
          <Row label="สถานที่เก็บ"><input className="inp" value={f.location || ""} onChange={(e) => set("location", e.target.value)} placeholder="Office / รถ / คลัง" /></Row>
        </div>
        <Row label="ผู้ขาย"><input className="inp" value={f.supplier || ""} onChange={(e) => set("supplier", e.target.value)} /></Row>
        <Row label="หมายเหตุ"><input className="inp" value={f.note || ""} onChange={(e) => set("note", e.target.value)} /></Row>
        {asset.id && <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={f.active !== false} onChange={(e) => set("active", e.target.checked)} /> ใช้งานอยู่</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!f.disposed} onChange={(e) => set("disposed", e.target.checked)} /> จำหน่าย/ตัดจำหน่ายแล้ว</label>
          {f.disposed && <input className="inp" type="date" style={{ width: 150 }} value={f.disposed_date || ""} onChange={(e) => set("disposed_date", e.target.value)} />}
        </div>}
        {preview && <div style={{ background: "var(--panel2,#f6f8fa)", borderRadius: 10, padding: "10px 12px", fontSize: 12.5 }}>
          <b>ค่าเสื่อม:</b> {fmtBaht(preview.perMonth)}/เดือน ({fmtBaht(r2(preview.perMonth * 12))}/ปี) · คงเหลือปัจจุบัน {fmtBaht(preview.book)}{preview.done ? " · คิดครบแล้ว" : ""}
        </div>}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        {onDelete && <button className="btn sm danger" onClick={onDelete} style={{ marginRight: "auto" }}>ลบ</button>}
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
    </div>
  </div>;
}
