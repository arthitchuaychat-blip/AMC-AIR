import React from "react";
import Combo from "./Combo";
import { fmtBaht2, fmtNum } from "../lib/format";
import { UIcon } from "../icons";

// Right-side product browser for document editors: tab by kind (แอร์/วัสดุ/บริการ),
// drill down with sub-filters, click an item to add it to the document.
const TABS = [{ v: "ac", l: "แอร์" }, { v: "material", l: "วัสดุ" }, { v: "service", l: "บริการ" }];

export default function ItemBrowser({ mats, onAdd, matTargets }) {
  const [kind, setKind] = React.useState("ac");
  const [q, setQ] = React.useState("");
  const [brand, setBrand] = React.useState("all");
  const [acType, setAcType] = React.useState("all");
  const [btu, setBtu] = React.useState("all");
  const [cat, setCat] = React.useState("all");
  const [matTarget, setMatTarget] = React.useState(matTargets?.[0]?.id);

  const brands = React.useMemo(() => [...new Set(mats.filter((m) => m.kind === "ac" && m.brand).map((m) => m.brand))].sort((a, b) => a.localeCompare(b)), [mats]);
  const acTypes = React.useMemo(() => [...new Set(mats.filter((m) => m.kind === "ac" && m.ac_type).map((m) => m.ac_type))].sort((a, b) => a.localeCompare(b, "th")), [mats]);
  const btus = React.useMemo(() => [...new Set(mats.filter((m) => m.kind === "ac" && m.btu).map((m) => m.btu))].sort((a, b) => a - b), [mats]);
  const cats = React.useMemo(() => { const seen = {}; mats.filter((m) => m.kind === "material" && m.cat).forEach((m) => { seen[m.cat] = m.catName || m.cat; }); return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1], "th")); }, [mats]);

  const reset = () => { setBrand("all"); setAcType("all"); setBtu("all"); setCat("all"); };
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = mats.filter((m) => {
    if (m.kind !== kind) return false;
    if (kind === "ac") { if (brand !== "all" && m.brand !== brand) return false; if (acType !== "all" && m.ac_type !== acType) return false; if (btu !== "all" && String(m.btu) !== String(btu)) return false; }
    if (kind === "material" && cat !== "all" && m.cat !== cat) return false;
    if (terms.length) { const h = `${m.th || ""} ${m.en || ""} ${m.code || ""} ${m.brand || ""} ${m.ac_type || ""} ${m.btu || ""}`.toLowerCase(); if (!terms.every((t) => h.includes(t))) return false; }
    return true;
  });
  const shown = list.slice(0, 80);

  return (
    <div className="ib">
      <div className="ib-head"><UIcon name="catalog" size={15} /> เพิ่มรายการเข้าเอกสาร</div>
      <div className="ib-tabs">{TABS.map((t) => <button key={t.v} className={"ib-tab" + (kind === t.v ? " on" : "")} onClick={() => { setKind(t.v); reset(); }}>{t.l}</button>)}</div>
      <div className="ib-search"><UIcon name="search" size={14} color="var(--ink-3)" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / รหัส…" />
        {q && <button className="cat-search-x" onClick={() => setQ("")}><UIcon name="x" size={12} /></button>}
      </div>
      {kind === "ac" && (
        <div className="ib-filters">
          <Combo className="inp" value={brand} onChange={(e) => setBrand(e.target.value)}><option value="all">ทุกยี่ห้อ</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}</Combo>
          <Combo className="inp" value={acType} onChange={(e) => setAcType(e.target.value)}><option value="all">ทุกประเภท</option>{acTypes.map((t) => <option key={t} value={t}>{t}</option>)}</Combo>
          <Combo className="inp" value={btu} onChange={(e) => setBtu(e.target.value)}><option value="all">ทุก BTU</option>{btus.map((b) => <option key={b} value={b}>{fmtNum(b)} BTU</option>)}</Combo>
        </div>
      )}
      {kind === "material" && (
        <div className="ib-filters">
          <Combo className="inp" value={cat} onChange={(e) => setCat(e.target.value)}><option value="all">ทุกหมวด</option>{cats.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Combo>
        </div>
      )}
      {kind === "material" && matTargets && (
        <div className="ib-target"><span>เพิ่มเข้า:</span>
          {matTargets.map((t) => <button key={t.id} className={"ib-target-btn" + (matTarget === t.id ? " on" : "")} onClick={() => setMatTarget(t.id)}>{t.label}</button>)}
        </div>
      )}
      <div className="ib-count">{list.length} รายการ</div>
      <div className="ib-list">
        {shown.length === 0 && <div className="ib-empty">ไม่พบรายการ</div>}
        {shown.map((m) => (
          <button key={m.code} className="ib-item" onClick={() => onAdd(m, m.kind === "material" ? matTarget : undefined)} title="เพิ่มเข้าเอกสาร">
            <div className="ib-item-main">
              <div className="ib-item-name">{m.th}</div>
              <div className="ib-item-sub">{m.code}{m.kind === "ac" ? [m.brand, m.ac_type, m.btu ? fmtNum(m.btu) + " BTU" : null].filter(Boolean).map((x) => " · " + x).join("") : (m.catName ? " · " + m.catName : "")}</div>
            </div>
            <div className="ib-item-price">{fmtBaht2(m.cost)}</div>
            <span className="ib-add"><UIcon name="plus" size={14} color="#fff" strokeWidth={2.6} /></span>
          </button>
        ))}
        {list.length > shown.length && <div className="ib-empty">…อีก {list.length - shown.length} รายการ — กรอง/ค้นหาเพิ่ม</div>}
      </div>
    </div>
  );
}
