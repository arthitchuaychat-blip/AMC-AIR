import React from "react";
import { confirmDialog } from "./ConfirmDialog";
import Combo from "./Combo";
import { listMaterials, listMaterialsLite, listCategories, saveMaterial, deactivateMaterial, listBrands, listBtus } from "../lib/api";
import { fmtBaht2, fmtNum, eqi, matchText, norm } from "../lib/format";
import { can } from "../lib/permissions";
import { MaterialThumb, UIcon } from "../icons";
import MaterialModal from "./MaterialModal";
import MaterialDrawer from "./MaterialDrawer";
import BulkImportModal from "./BulkImportModal";

const KINDS = [{ v: "all", l: "ทั้งหมด" }, { v: "ac", l: "เครื่องปรับอากาศ" }, { v: "service", l: "บริการ" }, { v: "material", l: "วัสดุ" }];
const KIND_LABEL = { ac: "แอร์", service: "บริการ", material: "วัสดุ" };

export default function Catalog({ role }) {
  const canEdit = can(role, "catalog", "edit");
  const [mats, setMats] = React.useState([]);
  const [cats, setCats] = React.useState([]);
  const [brands, setBrands] = React.useState([]);
  const [btus, setBtus] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState(null);
  const [kind, setKind] = React.useState("all");
  const [cat, setCat] = React.useState("all");
  const [brand, setBrand] = React.useState("all");
  const [btu, setBtu] = React.useState("all");
  const [acType, setAcType] = React.useState("all");
  const [q, setQ] = React.useState("");
  const [editing, setEditing] = React.useState(undefined);
  const [openMat, setOpenMat] = React.useState(null);
  const [viewMode, setViewMode] = React.useState("grid");
  const [importing, setImporting] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3200); };

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
  const btuOpts = React.useMemo(() => [...new Set(acMats.map((m) => m.btu).filter(Boolean).map(Number))].sort((a, b) => a - b), [acMats]);
  // One shared collator (th) — far faster than calling String.localeCompare per comparison.
  const collator = React.useMemo(() => new Intl.Collator("th"), []);
  // Memoized so it only recomputes when a filter actually changes — not on every unrelated render
  // (modal open, toast, hover). Uses `q` directly (NOT useDeferredValue) so a filter/search change
  // updates the list immediately — deferring it made the list look "stuck" until another action.
  const list = React.useMemo(() => mats.filter((m) =>
    (kind === "all" || m.kind === kind) &&
    (kind !== "material" || cat === "all" || m.cat === cat) &&
    (kind !== "ac" || brand === "all" || eqi(m.brand, brand)) &&
    (kind !== "ac" || btu === "all" || String(m.btu) === String(btu)) &&
    (kind !== "ac" || acType === "all" || eqi(m.ac_type, acType)) &&
    matchText(q, m.th, m.en, m.code, m.catName, m.brand, m.ac_type)
  ).sort((a, b) =>
    (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||                       // ชนิด: แอร์ → วัสดุ → บริการ
    collator.compare(a.brand || a.catName || "", b.brand || b.catName || "") ||   // ยี่ห้อ (แอร์) / หมวด (วัสดุ)
    collator.compare(a.th || "", b.th || "")                                       // แล้วเรียงตามตัวอักษรชื่อไทย
  ), [mats, kind, cat, brand, btu, acType, q, collator]);
  // Render in chunks — drawing the whole catalog at once is what made the page lag. Filtering/sort
  // still run over the FULL catalog (search never misses anything); we just paint `limit` cards and
  // grow on demand. Reset back to one page whenever the filter/search changes.
  const PAGE = 120;
  const [limit, setLimit] = React.useState(PAGE);
  React.useEffect(() => { setLimit(PAGE); }, [kind, cat, brand, btu, acType, q]);
  const capped = React.useMemo(() => list.slice(0, limit), [list, limit]);

  async function remove(m) {
    if (!await confirmDialog(`ลบ "${m.th}" ออกจากคลัง? (ประวัติยังเก็บไว้)`)) return;
    try { await deactivateMaterial(m.code); load(); }
    catch (e) { alert("ลบไม่สำเร็จ: " + (e.message || e)); }
  }

  // export the whole catalog as a CSV in the same column order as the import form (edit → re-upload to update)
  function exportCsv() {
    const KIND_TH = { ac: "แอร์", material: "วัสดุ", service: "บริการ" };
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const header = "ชนิด,รหัส,ชื่อไทย,ชื่ออังกฤษ,หมวด/ยี่ห้อ,BTU,หน่วย,ต้นทุน,ขั้นต่ำ,คงเหลือ,ราคาขาย,รายละเอียด,ประเภทแอร์";
    const rows = mats.map((m) => [
      KIND_TH[m.kind] || "วัสดุ", m.code, m.th, m.en,
      m.kind === "ac" ? (m.brand || "") : (m.kind === "material" ? (m.catName || "") : ""),
      m.kind === "ac" ? (m.btu || "") : "",
      m.unit || "", m.cost ?? "", m.minStock ?? "",
      m.tracked ? (m.stock ?? "") : "", m.salePrice ?? "",
      m.description || "", m.kind === "ac" ? (m.ac_type || "") : "",
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
          {canEdit && <button className="btn-ghost" onClick={exportCsv} disabled={!mats.length}><UIcon name="withdraw" size={15} /> ดาวน์โหลดรายการ</button>}
          {canEdit && <button className="btn-ghost" onClick={() => setImporting(true)}><UIcon name="box" size={15} /> นำเข้าหลายรายการ</button>}
          {canEdit && <button className="btn-primary" onClick={() => setEditing(null)}><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่มรายการ</button>}
        </div>
      </div>

      {/* type tabs */}
      <div className="cat-filter">
        {KINDS.map((k) => (
          <button key={k.v} className={"cat-chip" + (kind === k.v ? " on" : "")} onClick={() => { setKind(k.v); setCat("all"); setBrand("all"); setBtu("all"); setAcType("all"); }}
            style={kind === k.v ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>{k.l}</button>
        ))}
      </div>

      {/* sub-filters */}
      {kind === "material" && (
        <div className="cat-filter">
          <button className={"cat-chip" + (cat === "all" ? " on" : "")} onClick={() => setCat("all")} style={cat === "all" ? { background: "#111", color: "#fff", borderColor: "#111" } : {}}>ทุกหมวด</button>
          {cats.map((c) => (
            <button key={c.id} className={"cat-chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}
              style={cat === c.id ? { background: c.color, color: "#fff", borderColor: c.color } : { color: c.color }}>{c.name_th}</button>
          ))}
        </div>
      )}
      {kind === "ac" && (
        <div className="cat-filter" style={{ gap: 10 }}>
          <Combo className="inp" style={{ width: "auto" }} value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="all">ทุกยี่ห้อ</option>{brandOpts.map((b) => <option key={b} value={b}>{b}</option>)}
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

      {viewMode === "grid" && (
        <div className="cat-grid">
          {capped.map((m) => {
            const low = m.tracked && m.stock < m.minStock;
            return (
              <div className={"cat-card clickable" + (low ? " low" : "")} key={m.code} onClick={() => setOpenMat(m)}>
                <div className="cat-card-top">
                  <MaterialThumb mat={m} size={54} radius={14} />
                  <div className="cat-card-id">
                    <span className="code-chip">{m.code}</span>
                    {m.kind !== "material" && <span className="kind-badge">{KIND_LABEL[m.kind]}</span>}
                    {low && <span className="badge-warn sm">ต่ำกว่าขั้นต่ำ</span>}
                  </div>
                </div>
                <div className="cat-card-name">{m.th}</div>
                <div className="cat-card-en">{m.kind === "ac" ? [m.brand, m.ac_type, m.btu ? `${fmtNum(m.btu)} BTU` : null].filter(Boolean).join(" · ") || m.en : m.en}</div>
                {m.description && <div className="cat-card-desc">{m.description}</div>}
                <div className="cat-card-stats">
                  {m.tracked
                    ? <div><span>คงเหลือ</span><b style={low ? { color: "#dc2626" } : {}}>{m.stock} {m.unit}</b></div>
                    : <div><span>ประเภท</span><b>{m.kind === "service" ? "บริการ" : "สั่งตามงาน"}</b></div>}
                  <div><span>ต้นทุน</span><b>{fmtBaht2(m.cost)}</b></div>
                  <div><span>ราคาขาย</span><b style={{ color: "var(--up)" }}>{fmtBaht2(m.salePrice)}</b></div>
                </div>
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
              <div className={"cat-lrow" + (low ? " low" : "")} key={m.code} onClick={() => setOpenMat(m)}>
                <MaterialThumb mat={m} size={40} radius={11} />
                <div className="cat-lrow-main">
                  <div className="cat-lrow-name">{m.th} {m.kind !== "material" && <span className="kind-badge">{KIND_LABEL[m.kind]}</span>} {low && <span className="badge-warn sm">ต่ำ</span>}</div>
                  <div className="cat-lrow-sub"><span className="code-chip">{m.code}</span> {m.kind === "ac" ? [m.brand, m.ac_type, m.btu ? `${fmtNum(m.btu)} BTU` : null].filter(Boolean).join(" · ") : m.catName + " · " + m.en}</div>
                  {m.description && <div className="cat-lrow-desc">{m.description}</div>}
                </div>
                <div className="cat-lrow-col hide-sm"><span>คงเหลือ</span><b style={low ? { color: "#dc2626" } : {}}>{m.tracked ? `${m.stock} ${m.unit}` : "—"}</b></div>
                <div className="cat-lrow-col hide-sm"><span>ต้นทุน</span><b>{fmtBaht2(m.cost)}</b></div>
                <div className="cat-lrow-col"><span>ราคาขาย</span><b style={{ color: "var(--up)" }}>{fmtBaht2(m.salePrice)}</b></div>
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
        <BulkImportModal categories={cats} onClose={() => setImporting(false)}
          onDone={(n) => { setImporting(false); alert(`นำเข้า ${n} รายการสำเร็จ`); load(); }} />
      )}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#16a34a", color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "12px 22px", borderRadius: 12, boxShadow: "var(--shadow-lg)", zIndex: 300, maxWidth: "90%", textAlign: "center" }}>{toast}</div>
      )}
      {openMat && <MaterialDrawer mat={openMat} onClose={() => setOpenMat(null)} />}
      {editing !== undefined && (
        <MaterialModal initial={editing} categories={cats} brands={brands} btus={btus} acTypes={acTypes}
          defaultKind={kind === "all" ? "material" : kind}
          onSave={saveMaterial}
          onSaved={(savedKind) => { setEditing(undefined); if (savedKind) { setKind(savedKind); setCat("all"); setBrand("all"); setBtu("all"); setAcType("all"); flash(`บันทึกสำเร็จ ✓ — อยู่ในแท็บ "${KINDS.find((k) => k.v === savedKind)?.l || savedKind}"`); } load(); }}
          onClose={() => setEditing(undefined)} />
      )}
    </div>
  );
}
