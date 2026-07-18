import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listMaterials, listMaterialsLite, listCategories, saveCategory, saveMaterial, deactivateMaterial, listBrands, listBtus, saveBrand, saveBtu, setMaterialsWebPublished } from "../lib/api";
import { fmtBaht, fmtBaht2, fmtNum, eqi, matchText, norm } from "../lib/format";
import { can } from "../lib/permissions";
import { MaterialThumb, UIcon } from "../icons";
import MaterialModal from "./MaterialModal";
import MaterialDrawer from "./MaterialDrawer";
import BulkImportModal from "./BulkImportModal";
import AcMediaManager from "./AcMediaManager";

const KINDS = [{ v: "all", l: "ทั้งหมด" }, { v: "ac", l: "เครื่องปรับอากาศ" }, { v: "service", l: "บริการ" }, { v: "material", l: "วัสดุ" }];
const KIND_LABEL = { ac: "แอร์", service: "บริการ", material: "วัสดุ" };

// หมวดค่าบริการ — id คงที่ ตรงกับแถวในตาราง categories (migration 102) · รายการเก่าที่ยังไม่จัดหมวด = อื่นๆ
export const SERVICE_CATS = [
  { id: "sv-install", l: "ติดตั้ง" }, { id: "sv-clean", l: "ล้าง" }, { id: "sv-move", l: "ย้าย" },
  { id: "sv-repair", l: "ซ่อม" }, { id: "sv-remove", l: "รื้อถอน" }, { id: "sv-other", l: "อื่นๆ" },
];
const svcCatLabel = (m) => (SERVICE_CATS.find((c) => c.id === m.cat) || {}).l || "อื่นๆ";
const svcCatMatch = (m, id) => (id === "sv-other" ? m.cat === "sv-other" || !String(m.cat || "").startsWith("sv-") : m.cat === id);
// BTU ของบริการเป็น "ช่วง" (btu_min–btu_max · mig 103): เลือกขนาดที่อยู่ในช่วง = เจอ · ตัวเก่าที่มีค่าเดี่ยว = ต้องตรง
const svcBtuHit = (m, b) => {
  if (m.btu_min != null || m.btu_max != null) {
    const lo = Number(m.btu_min ?? m.btu_max), hi = Number(m.btu_max ?? m.btu_min), B = Number(b);
    return B >= lo && B <= hi;
  }
  return String(m.btu) === String(b);
};
const svcBtuText = (m) =>
  m.btu_min != null && m.btu_max != null && Number(m.btu_min) !== Number(m.btu_max)
    ? `${fmtNum(m.btu_min)}–${fmtNum(m.btu_max)} BTU`
    : (m.btu_min ?? m.btu) ? `${fmtNum(m.btu_min ?? m.btu)} BTU` : null;

// ราคาชำระด้วยบัตรเครดิต (ทุกชนิด: แอร์ · บริการ · วัสดุ) — คิดจากราคาเงินสด ปัดขึ้นเป็นบาทเต็ม
const CARD_RATES = { full: 0.04, inst10: 0.14 };   // รูดเต็ม · ผ่อน 10 เดือน
const cardPrice = (p, r) => Math.ceil((Number(p) || 0) * (1 + r));
const hasCardPrice = (m) => Number(m.salePrice) > 0;
function CardPayLine({ m, compact }) {
  if (!hasCardPrice(m)) return null;
  const full = cardPrice(m.salePrice, CARD_RATES.full), inst = cardPrice(m.salePrice, CARD_RATES.inst10);
  return (
    <div style={{ fontSize: compact ? 11 : 11.5, color: "#7c5c00", background: "#fff8e6", border: "1px solid #f3e3ad", borderRadius: 8, padding: "3px 8px", marginTop: 6, lineHeight: 1.5 }}>
      💳 รูดเต็ม <b>{fmtBaht(full)}</b> · ผ่อน 10 ด. <b>{fmtBaht(inst)}</b> <span style={{ opacity: .75 }}>(≈{fmtBaht(Math.ceil(inst / 10))}/ด.)</span>
    </div>
  );
}

// สินค้า 2 หน่วย: แตกยอดคงเหลือเป็นหน่วยใหญ่+เศษ เช่น 247 เมตร (1 ม้วน = 100 เมตร) → "= 2 ม้วน 47 เมตร"
function dualStockText(m) {
  const f = Number(m.purchaseQty) || 0;
  if (!m.purchaseUnit || f <= 1 || !m.tracked || m.stock <= 0) return null;
  const whole = Math.floor(m.stock / f);
  if (whole < 1) return null;
  const rem = Math.round((m.stock - whole * f) * 100) / 100;
  return `= ${fmtNum(whole)} ${m.purchaseUnit}${rem > 0 ? ` ${fmtNum(rem)} ${m.unit}` : ""}`;
}
// มูลค่าต้นทุนของสต๊อกคงเหลือ (stock × ต้นทุน/หน่วยหลัก)
const stockValue = (m) => (m.tracked && m.stock > 0 ? m.stock * m.cost : 0);

export default function Catalog({ role }) {
  const canEdit = can(role, "catalog", "edit");
  const [mats, setMats] = React.useState([]);
  const [stockReady, setStockReady] = React.useState(false); // ยอดคงเหลือจริง merge เสร็จหรือยัง (โหลดสองจังหวะ)
  const [cats, setCats] = React.useState([]);
  const [brands, setBrands] = React.useState([]);
  const [btus, setBtus] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [kind, setKind] = React.useState("all");
  const [cat, setCat] = React.useState("all");
  const [brand, setBrand] = React.useState("all");
  const [series, setSeries] = React.useState("all");   // รุ่น/ซีรีส์ (mig 106) — ไล่ชั้น ยี่ห้อ → รุ่น → ขนาด
  const [btu, setBtu] = React.useState("all");
  const [acType, setAcType] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState(undefined);
  const [openMat, setOpenMat] = React.useState(null);
  const [viewMode, setViewMode] = React.useState("grid");
  const [importing, setImporting] = React.useState(false);
  const [mediaMgr, setMediaMgr] = React.useState(false);   // หน้าจัดการ รูป & คุณสมบัติแอร์ (ทั้งรุ่นทีเดียว)
  const [toast, setToast] = React.useState(null);
  const [sel, setSel] = React.useState(() => new Set()); // selected codes for bulk web show/hide
  const [pubBusy, setPubBusy] = React.useState(false);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3200); };
  const toggleSel = (code) => setSel((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const clearSel = () => setSel(new Set());

  async function load() {
    setLoading(true); setErr(null);
    try {
      // Fast first paint: the "lite" catalog reads the materials table directly (no per-item
      // stock aggregation over every transaction), so the page is usable almost immediately.
      const [lite, c, b, bt] = await Promise.all([listMaterialsLite(), listCategories(), listBrands(), listBtus()]);
      setMats(lite); setCats(c); setBrands(b); setBtus(bt);
      setLoading(false);
      // Then MERGE live stock numbers from the material_stock view by code — do NOT replace the list.
      // (The view GROUPs BY code, so replacing would drop any materials sharing a code; the lite list
      //  from the materials table is the authoritative item set and matches the BOQ/quotation picker.)
      listMaterials().then((full) => {
        const stockByCode = {};
        full.forEach((m) => { if (m.code != null) stockByCode[m.code] = m.stock; });
        setMats((cur) => cur.map((m) => (m.code in stockByCode ? { ...m, stock: stockByCode[m.code] } : m)));
        setStockReady(true);   // ยอดคงเหลือจริงมาแล้ว — เปิดปุ่มดาวน์โหลด CSV ได้ (กันส่งออกเลขตั้งต้นไปใช้นับของ)
      }).catch(() => {});
    } catch (e) { setErr(e.message || String(e)); setLoading(false); }
  }
  React.useEffect(() => { load(); }, []);

  const KIND_ORDER = { ac: 0, material: 1, service: 2 };
  // Filter options derived FROM the catalog itself (deduped case-insensitively) so every option
  // matches real data — no missing brands and no case/space duplicate entries splitting the list.
  const dedupe = (vals) => { const seen = new Map(); vals.forEach((v) => { const k = norm(v); if (k && !seen.has(k)) seen.set(k, v); }); return [...seen.values()]; };
  const acMats = React.useMemo(() => mats.filter((m) => m.kind === "ac"), [mats]);
  const brandOpts = React.useMemo(() => dedupe(acMats.map((m) => m.brand)).sort((a, b) => a.localeCompare(b, "th")), [acMats]);
  const acTypes = React.useMemo(() => dedupe(acMats.map((m) => m.ac_type)).sort((a, b) => a.localeCompare(b, "th")), [acMats]);
  const seriesAll = React.useMemo(() => dedupe(acMats.map((m) => m.series)).sort((a, b) => a.localeCompare(b, "th")), [acMats]);
  // รุ่นที่โชว์ในตัวกรอง — ไล่ตามยี่ห้อที่เลือก
  const seriesOpts = React.useMemo(() => dedupe(acMats.filter((m) => brand === "all" || eqi(m.brand, brand)).map((m) => m.series)).sort((a, b) => a.localeCompare(b, "th")), [acMats, brand]);

  // save the item + register any NEW brand/BTU so it persists in the dropdown & filters next time
  async function handleSaveMaterial(row, isNew) {
    await saveMaterial(row, isNew);
    if (row.kind === "ac") {
      if (row.brand?.trim()) { try { await saveBrand(row.brand.trim()); } catch { /* dup — ignore */ } }
      if (row.btu) { try { await saveBtu(Number(row.btu)); } catch { /* dup — ignore */ } }
    }
  }
  // สร้าง "หมวดวัสดุ" ใหม่จากในฟอร์มสินค้า — id อัตโนมัติ · ชื่อซ้ำ = ใช้หมวดเดิม · คืน id ให้ฟอร์มเลือกต่อ
  async function addProductCategory(name) {
    const nm = (name || "").trim();
    if (!nm) throw new Error("ใส่ชื่อหมวด");
    const dup = cats.find((c) => (c.name_th || "").trim() === nm);
    if (dup) return dup.id;
    const id = "c" + Date.now().toString(36);
    await saveCategory({ id, name_th: nm });   // ต้องรัน migration 099 (เปิดสิทธิ์เขียนตาราง categories)
    setCats(await listCategories());
    return id;
  }
  const btuOpts = React.useMemo(() => [...new Set(acMats.map((m) => m.btu).filter(Boolean).map(Number))].sort((a, b) => a - b), [acMats]);
  // ตัวเลือกกรองแท็บบริการ (ประเภทแอร์/BTU) — ใช้ค่าที่บริการติดแท็กไว้ก่อน ถ้ายังไม่มีเลยใช้ชุดของแอร์
  const svcMats = React.useMemo(() => mats.filter((m) => m.kind === "service"), [mats]);
  const svcTypeOpts = React.useMemo(() => { const o = [...new Set(svcMats.map((m) => m.ac_type).filter(Boolean))]; return (o.length ? o : acTypes).slice().sort((a, b) => a.localeCompare(b, "th")); }, [svcMats, acTypes]);
  const svcBtuOpts = React.useMemo(() => {
    const vals = new Set(btuOpts);   // ขนาดมาตรฐานจากแอร์ + ทุกค่า/ขอบช่วงที่บริการติดแท็กไว้
    svcMats.forEach((m) => [m.btu, m.btu_min, m.btu_max].forEach((v) => { if (v) vals.add(Number(v)); }));
    return [...vals].sort((a, b) => a - b);
  }, [svcMats, btuOpts]);
  // One shared collator (th) — far faster than calling String.localeCompare per comparison.
  const collator = React.useMemo(() => new Intl.Collator("th"), []);
  // Memoized so it only recomputes when a filter actually changes — not on every unrelated render
  // (modal open, toast, hover). Uses `q` directly (NOT useDeferredValue) so a filter/search change
  // updates the list immediately — deferring it made the list look "stuck" until another action.
  const list = React.useMemo(() => mats.filter((m) =>
    (kind === "all" || m.kind === kind) &&
    (kind !== "material" || cat === "all" || m.cat === cat) &&
    (kind !== "service" || cat === "all" || svcCatMatch(m, cat)) &&
    (kind !== "service" || acType === "all" || eqi(m.ac_type, acType)) &&
    (kind !== "service" || btu === "all" || svcBtuHit(m, btu)) &&
    (kind !== "ac" || brand === "all" || eqi(m.brand, brand)) &&
    (kind !== "ac" || series === "all" || eqi(m.series, series)) &&
    (kind !== "ac" || btu === "all" || String(m.btu) === String(btu)) &&
    (kind !== "ac" || acType === "all" || eqi(m.ac_type, acType)) &&
    matchText(q, m.th, m.en, m.code, m.catName, m.brand, m.ac_type)
  ).sort((a, b) =>
    (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||                       // ชนิด: แอร์ → วัสดุ → บริการ
    collator.compare(a.brand || a.catName || "", b.brand || b.catName || "") ||   // ยี่ห้อ (แอร์) / หมวด (วัสดุ)
    collator.compare(a.th || "", b.th || "")                                       // แล้วเรียงตามตัวอักษรชื่อไทย
  ), [mats, kind, cat, brand, series, btu, acType, q, collator]);
  // Render in chunks — drawing the whole catalog at once is what made the page lag. Filtering/sort
  // still run over the FULL catalog (search never misses anything); we just paint `limit` cards and
  // grow on demand. Reset back to one page whenever the filter/search changes.
  const PAGE = 120;
  const [limit, setLimit] = React.useState(PAGE);
  React.useEffect(() => { setLimit(PAGE); }, [kind, cat, brand, series, btu, acType, q]);
  const capped = React.useMemo(() => list.slice(0, limit), [list, limit]);

  // bulk show/hide the selected items on the public website
  const allVisibleSelected = capped.length > 0 && capped.every((m) => sel.has(m.code));
  function toggleSelectAll() { setSel((s) => { if (capped.every((m) => s.has(m.code))) { const n = new Set(s); capped.forEach((m) => n.delete(m.code)); return n; } const n = new Set(s); capped.forEach((m) => n.add(m.code)); return n; }); }
  async function bulkPublish(published) {
    const codes = [...sel]; if (!codes.length) return;
    setPubBusy(true);
    try {
      await setMaterialsWebPublished(codes, published);
      const cs = new Set(codes);
      setMats((cur) => cur.map((m) => (cs.has(m.code) ? { ...m, webPublished: published } : m)));
      clearSel();
      flash(`${published ? "🌐 แสดงบนเว็บแล้ว" : "ซ่อนจากเว็บแล้ว"} ${codes.length} รายการ ✓`);
    } catch (e) { flash("ไม่สำเร็จ: " + (e.message || e)); }
    setPubBusy(false);
  }

  async function remove(m) {
    if (!await confirmDialog(`ลบ "${m.th}" ออกจากคลัง? (ประวัติยังเก็บไว้)`)) return;
    try { await deactivateMaterial(m.code); load(); }
    catch (e) { alert("ลบไม่สำเร็จ: " + (e.message || e)); }
  }

  // export the whole catalog as a CSV in the same column order as the import form (edit → re-upload to update)
  function exportCsv() {
    const KIND_TH = { ac: "แอร์", material: "วัสดุ", service: "บริการ" };
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = "ชนิด,รหัส,ชื่อไทย,ชื่ออังกฤษ,หมวด/ยี่ห้อ,BTU,หน่วย,ต้นทุน,ขั้นต่ำ,คงเหลือ,ราคาขาย,รายละเอียด,ประเภทแอร์,ประมาณค่าไฟ/ปี,คุณสมบัติสินค้า";
    const rows = mats.map((m) => [
      KIND_TH[m.kind] || "วัสดุ", m.code, m.th, m.en,
      m.kind === "ac" ? (m.brand || "") : (m.kind === "material" ? (m.catName || "") : svcCatLabel(m)),
      m.kind === "ac" ? (m.btu || "") : "",
      m.unit || "", m.cost ?? "", m.minStock ?? "",
      m.tracked ? (m.stock ?? "") : "", m.salePrice ?? "",
      m.description || "", m.kind === "ac" ? (m.ac_type || "") : "",
      m.power_cost_year ?? "", m.features || "",
    ].map(esc).join(","));
    const csv = "﻿" + [header, ...rows].join("\r\n"); // BOM so Excel reads Thai correctly
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `amc-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash(`ดาวน์โหลด ${mats.length} รายการแล้ว ✓`);
  }

  const EditDel = ({ m }) => canEdit && (
    <div className="cat-card-actions" onClick={(e) => e.stopPropagation()}>
      <button className="btn-ghost sm" onClick={() => setEditing(m)}><UIcon name="edit" size={14} /> แก้ไข</button>
      <button className="btn-ghost sm" onClick={() => setEditing({ ...m, code: (m.code || "") + "-2", stock: 0, _dup: true })}><UIcon name="clipboard" size={14} /> สร้างสำเนา</button>
      <button className="btn-ghost sm danger" onClick={() => remove(m)}><UIcon name="trash" size={14} /> ลบ</button>
    </div>
  );

  return (
    <div className="adm">
      <div className="adm-head">
        <div>
          <h1 className="page-title">คลังสินค้า/บริการ <span className="page-title-en">Catalog</span></h1>
          <p className="page-sub">{mats.length} รายการ · แอร์ · บริการ · วัสดุ · {canEdit ? "เพิ่ม/แก้ไข/ลบได้" : "ดูอย่างเดียว"}</p>
        </div>
        <div className="cat-head-actions">
          <div className="cat-search">
            <UIcon name="search" size={17} color="var(--ink-3)" />
            <input placeholder="ค้นหา ชื่อ / รหัส / ยี่ห้อ / ประเภท" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={15} /></button>}
          </div>
          <div className="seg view-seg">
            <button className={"seg-btn" + (viewMode === "grid" ? " on" : "")} onClick={() => setViewMode("grid")} title="กริด"><UIcon name="dashboard" size={16} /></button>
            <button className={"seg-btn" + (viewMode === "list" ? " on" : "")} onClick={() => setViewMode("list")} title="ตาราง"><UIcon name="catalog" size={16} /></button>
          </div>
          {canEdit && <button className="btn-ghost" onClick={exportCsv} disabled={!mats.length || !stockReady} title={stockReady ? "" : "รอโหลดยอดคงเหลือจริงก่อน (กันได้เลขตั้งต้นไปใช้นับของ)"}><UIcon name="withdraw" size={15} /> {stockReady ? "ดาวน์โหลดรายการ" : "รอยอดคงเหลือ…"}</button>}
          {canEdit && <button className="btn-ghost" onClick={() => setImporting(true)}><UIcon name="box" size={15} /> นำเข้าหลายรายการ</button>}
          {canEdit && <button className="btn-ghost" onClick={() => setMediaMgr(true)} title="ตั้งรูป official + คุณสมบัติ ให้ทุกขนาดในรุ่นทีเดียว">🖼️ รูป & คุณสมบัติแอร์</button>}
          {canEdit && <button className="btn-primary" onClick={() => setEditing(null)}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่มรายการ</button>}
        </div>
      </div>

      {/* type tabs */}
      <div className="cat-filter">
        {KINDS.map((k) => (
          <button key={k.v} className={"cat-chip" + (kind === k.v ? " on" : "")} onClick={() => { setKind(k.v); setCat("all"); setBrand("all"); setSeries("all"); setBtu("all"); setAcType("all"); }}
            style={kind === k.v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{k.l}</button>
        ))}
      </div>

      {/* sub-filters */}
      {kind === "material" && (
        <div className="cat-filter">
          <button className={"cat-chip" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")} style={cat === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทุกหมวด</button>
          {cats.filter((c) => !String(c.id).startsWith("sv-")).map((c) => (
            <button key={c.id} className={"cat-chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}
              style={cat === c.id ? { background: c.color, color: "#fff", borderColor: c.color } : { color: c.color }}>{c.name_th}</button>
          ))}
        </div>
      )}
      {kind === "service" && (
        <div className="cat-filter">
          <button className={"cat-chip" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")} style={cat === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทุกหมวด</button>
          {SERVICE_CATS.map((c) => (
            <button key={c.id} className={"cat-chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}
              style={cat === c.id ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{c.l}</button>
          ))}
          <Combo className="inp" style={{ width: "auto", marginLeft: 6 }} value={acType} onChange={(e) => setAcType(e.target.value)}>
            <option value="all">ทุกประเภทแอร์</option>{svcTypeOpts.map((t) => <option key={t} value={t}>{t}</option>)}
          </Combo>
          <Combo className="inp" style={{ width: "auto" }} value={btu} onChange={(e) => setBtu(e.target.value)}>
            <option value="all">ทุกขนาด BTU</option>{svcBtuOpts.map((b) => <option key={b} value={b}>{fmtNum(b)} BTU</option>)}
          </Combo>
        </div>
      )}
      {kind === "ac" && (
        <div className="cat-filter" style={{ gap: 10 }}>
          <Combo className="inp" style={{ width: "auto" }} value={brand} onChange={(e) => { setBrand(e.target.value); setSeries("all"); }}>
            <option value="all">ทุกยี่ห้อ</option>{brandOpts.map((b) => <option key={b} value={b}>{b}</option>)}
          </Combo>
          <Combo className="inp" style={{ width: "auto" }} value={series} onChange={(e) => setSeries(e.target.value)}>
            <option value="all">ทุกรุ่น</option>{seriesOpts.map((s) => <option key={s} value={s}>{s}</option>)}
          </Combo>
          <Combo className="inp" style={{ width: "auto" }} value={btu} onChange={(e) => setBtu(e.target.value)}>
            <option value="all">ทุกขนาด BTU</option>{btuOpts.map((b) => <option key={b} value={b}>{fmtNum(b)} BTU</option>)}
          </Combo>
          <Combo className="inp" style={{ width: "auto" }} value={acType} onChange={(e) => setAcType(e.target.value)}>
            <option value="all">ทุกประเภทแอร์</option>{acTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </Combo>
        </div>
      )}

      {loading && <div className="empty">กำลังโหลด…</div>}
      {err && <div className="empty" style={{ color: "var(--down)" }}>โหลดข้อมูลไม่สำเร็จ: {err}</div>}
      {!loading && !err && list.length === 0 && <div className="empty">ไม่พบรายการ{q && ` “${q}”`}</div>}
      {!loading && !err && list.length > limit && (
        <div className="page-sub" style={{ margin: "2px 2px 12px" }}>แสดง {fmtNum(capped.length)} จาก {fmtNum(list.length)} รายการ · พิมพ์ค้นหาหรือเลือกตัวกรองเพื่อให้แคบลง</div>
      )}
      {!loading && !err && canEdit && capped.length > 0 && (
        <label className="cat-selectall"><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} /> เลือกทั้งหมดที่แสดง ({fmtNum(capped.length)}) <span className="cat-selectall-hint">— ติ๊กเพื่อโชว์/ไม่โชว์บนเว็บไซต์</span></label>
      )}

      {viewMode === "grid" && (
        <div className="cat-grid">
          {capped.map((m) => {
            const low = m.tracked && m.stock < m.minStock;
            return (
              <div className={"cat-card clickable" + (low ? " low" : "") + (sel.has(m.code) ? " selected" : "")} key={m.code} onClick={() => setOpenMat(m)}>
                {canEdit && <label className="cat-check card" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(m.code)} onChange={() => toggleSel(m.code)} /></label>}
                <div className="cat-card-top">
                  <MaterialThumb mat={m} size={54} radius={14} />
                  <div className="cat-card-id">
                    <span className="code-chip">{m.code}</span>
                    {m.kind !== "material" && <span className="kind-badge">{KIND_LABEL[m.kind]}</span>}
                    {m.webPublished && <span className="web-badge" title="แสดงบนเว็บไซต์">🌐</span>}
                    {low && <span className="badge-warn sm">ต่ำกว่าขั้นต่ำ</span>}
                  </div>
                </div>
                <div className="cat-card-name">{m.th}</div>
                <div className="cat-card-en">{m.kind === "ac" ? [m.brand, m.series, m.ac_type, m.btu ? `${fmtNum(m.btu)} BTU` : null].filter(Boolean).join(" · ") || m.en : m.kind === "service" ? [svcCatLabel(m), m.ac_type, svcBtuText(m), m.en].filter(Boolean).join(" · ") : m.en}</div>
                {m.description && <div className="cat-card-desc">{m.description}</div>}
                <div className="cat-card-stats">
                  {m.tracked
                    ? <div><span>คงเหลือ</span><b style={low ? { color: "#dc2626" } : {}}>{fmtNum(m.stock)} {m.unit}</b>
                        {dualStockText(m) && <small className="cat-substat">{dualStockText(m)}</small>}
                        {stockValue(m) > 0 && <small className="cat-substat">ทุน {fmtBaht(stockValue(m))}</small>}</div>
                    : <div><span>ประเภท</span><b>{m.kind === "service" ? "บริการ" : "สั่งตามงาน"}</b></div>}
                  <div><span>ต้นทุน</span><b>{fmtBaht2(m.cost)}</b><small className="cat-substat">/{m.unit || "หน่วย"}</small></div>
                  <div><span>ราคาขาย</span><b style={{ color: "var(--up)" }}>{fmtBaht2(m.salePrice)}</b><small className="cat-substat">/{m.unit || "หน่วย"}</small></div>
                </div>
                <CardPayLine m={m} />
                {m.tracked && <div className="cat-card-move">ดูการเคลื่อนไหว <UIcon name="chevR" size={13} strokeWidth={2.2} color="currentColor" /></div>}
                <EditDel m={m} />
              </div>
            );
          })}
        </div>
      )}

      {viewMode === "list" && (
        <div className="cat-list">
          {capped.map((m) => {
            const low = m.tracked && m.stock < m.minStock;
            return (
              <div className={"cat-lrow" + (low ? " low" : "") + (sel.has(m.code) ? " selected" : "")} key={m.code} onClick={() => setOpenMat(m)}>
                {canEdit && <label className="cat-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(m.code)} onChange={() => toggleSel(m.code)} /></label>}
                <MaterialThumb mat={m} size={40} radius={11} />
                <div className="cat-lrow-main">
                  <div className="cat-lrow-name">{m.th} {m.kind !== "material" && <span className="kind-badge">{KIND_LABEL[m.kind]}</span>} {low && <span className="badge-warn sm">ต่ำ</span>}</div>
                  <div className="cat-lrow-sub"><span className="code-chip">{m.code}</span> {m.kind === "ac" ? [m.brand, m.series, m.ac_type, m.btu ? `${fmtNum(m.btu)} BTU` : null].filter(Boolean).join(" · ") : m.kind === "service" ? [svcCatLabel(m), m.ac_type, svcBtuText(m), m.en].filter(Boolean).join(" · ") : m.catName + " · " + m.en}</div>
                  {m.description && <div className="cat-lrow-desc">{m.description}</div>}
                </div>
                <div className="cat-lrow-col hide-sm"><span>สต๊อก</span><span className={"job-badge " + (m.tracked ? "b-blue" : "b-grey")} title={m.tracked ? "นับสต๊อก (เบิก/คืน/ซื้อได้)" : "ไม่นับสต๊อก (สั่งตามงาน)"}>{m.tracked ? "✓ นับสต๊อก" : "ไม่นับ"}</span></div>
                <div className="cat-lrow-col hide-sm"><span>เว็บไซต์</span><span className={"job-badge " + (m.webPublished ? "b-green" : "b-grey")} title={m.webPublished ? "แสดงบนเว็บไซต์" : "ไม่แสดงบนเว็บไซต์"}>{m.webPublished ? "🌐 โชว์" : "ไม่โชว์"}</span></div>
                <div className="cat-lrow-col hide-sm"><span>คงเหลือ</span><b style={low ? { color: "#dc2626" } : {}}>{m.tracked ? `${fmtNum(m.stock)} ${m.unit}` : "—"}</b>
                  {dualStockText(m) && <small className="cat-substat">{dualStockText(m)}</small>}
                  {stockValue(m) > 0 && <small className="cat-substat">ทุนคงเหลือ {fmtBaht(stockValue(m))}</small>}</div>
                <div className="cat-lrow-col hide-sm"><span>ต้นทุน</span><b>{fmtBaht2(m.cost)}</b><small className="cat-substat">/{m.unit || "หน่วย"}</small></div>
                <div className="cat-lrow-col"><span>ราคาขาย</span><b style={{ color: "var(--up)" }}>{fmtBaht2(m.salePrice)}</b><small className="cat-substat">/{m.unit || "หน่วย"}</small>
                  {hasCardPrice(m) && <small className="cat-substat" style={{ color: "#7c5c00" }}>💳 {fmtBaht(cardPrice(m.salePrice, CARD_RATES.full))} · ผ่อน10ด. {fmtBaht(cardPrice(m.salePrice, CARD_RATES.inst10))}</small>}</div>
                <EditDel m={m} />
              </div>
            );
          })}
        </div>
      )}

      {!loading && !err && list.length > limit && (
        <div style={{ display: "flex", justifyContent: "center", margin: "16px 0 4px" }}>
          <button className="btn-ghost" onClick={() => setLimit((n) => n + PAGE)}>
            แสดงเพิ่ม · เหลืออีก {fmtNum(list.length - limit)} รายการ
          </button>
        </div>
      )}

      {importing && (
        <BulkImportModal categories={cats} existingCodes={new Set(mats.map((m) => m.code))} onClose={() => setImporting(false)}
          onDone={(res) => { setImporting(false); const r = res || {}; alert(`นำเข้าสำเร็จ ✓  อัพเดททับ ${r.updated || 0} · เพิ่มใหม่ ${r.inserted || 0} รายการ`); load(); }} />
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 300, maxWidth: "90%", textAlign: "center" }}>{toast}</div>
      )}
      {sel.size > 0 && (
        <div className="cat-bulkbar">
          <span className="cat-bulkbar-n">เลือก <b>{fmtNum(sel.size)}</b> รายการ</span>
          <button className="btn-primary sm" disabled={pubBusy} onClick={() => bulkPublish(true)}>🌐 โชว์บนเว็บ</button>
          <button className="btn-ghost sm" disabled={pubBusy} onClick={() => bulkPublish(false)}>🚫 ไม่โชว์บนเว็บ</button>
          <button className="cat-bulkbar-x" onClick={clearSel} title="ล้างที่เลือก">ล้าง</button>
        </div>
      )}
      {mediaMgr && <AcMediaManager mats={mats} onChanged={() => {}} onClose={(changed) => { setMediaMgr(false); if (changed) load(); }} />}
      {openMat && <MaterialDrawer mat={openMat} onClose={() => setOpenMat(null)}
        onEdit={canEdit ? () => { const m = openMat; setOpenMat(null); setEditing(m); } : null} />}
      {editing !== undefined && (
        <MaterialModal initial={editing} categories={cats.filter((c) => !String(c.id).startsWith("sv-"))} brands={brands} btus={btus} acTypes={acTypes} seriesList={seriesAll} onAddCategory={addProductCategory}
          defaultKind={kind === "all" ? "material" : kind}
          onSave={handleSaveMaterial}
          onSaved={(savedKind) => { setEditing(undefined); if (savedKind) { setKind(savedKind); setCat("all"); setBrand("all"); setSeries("all"); setBtu("all"); setAcType("all"); flash(`บันทึกสำเร็จ ✓ — อยู่ในแท็บ "${KINDS.find((k) => k.v === savedKind)?.l || savedKind}"`); } load(); }}
          onClose={() => setEditing(undefined)} />
      )}
    </div>
  );
}
