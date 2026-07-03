import React from "react";
import Combo from "./Combo";
import { fmtBaht2, fmtNum } from "../lib/format";
import { UIcon, MaterialThumb } from "../icons";

// Right-side product browser for document editors: tab by kind (แอร์/วัสดุ/บริการ),
// drill down with sub-filters, tap a photo card → enter quantity → add (same flow as Stock Movements).
const TABS = [{ v: "ac", l: "แอร์" }, { v: "material", l: "วัสดุ" }, { v: "service", l: "บริการ" }];

export default function ItemBrowser({ mats, onAdd, matTargets, unitOf }) {
  const unitLbl = (m) => ((unitOf ? unitOf(m) : m?.unit) || "หน่วย");  // e.g. PO passes purchase unit (ม้วน)
  const [kind, setKind] = React.useState("ac");
  const [q, setQ] = React.useState("");
  const [brand, setBrand] = React.useState("all");
  const [acType, setAcType] = React.useState("all");
  const [btu, setBtu] = React.useState("all");
  const [cat, setCat] = React.useState("all");
  const [matTarget, setMatTarget] = React.useState(matTargets?.[0]?.id);
  const [qtyModal, setQtyModal] = React.useState(null); // material being added
  const [modalQty, setModalQty] = React.useState(1);

  const brands = React.useMemo(() => [...new Set(mats.filter((m) => m.kind === "ac" && m.brand).map((m) => m.brand))].sort((a, b) => a.localeCompare(b)), [mats]);
  const acTypes = React.useMemo(() => [...new Set(mats.filter((m) => m.kind === "ac" && m.ac_type).map((m) => m.ac_type))].sort((a, b) => a.localeCompare(b, "th")), [mats]);
  const btus = React.useMemo(() => [...new Set(mats.filter((m) => m.kind === "ac" && m.btu).map((m) => m.btu))].sort((a, b) => a - b), [mats]);
  const cats = React.useMemo(() => { const seen = {}; mats.filter((m) => m.kind === "material" && m.cat).forEach((m) => { seen[m.cat] = m.catName || m.cat; }); return Object.entries(seen).sort((a, b) => a[1].localeCompare(b[1], "th")); }, [mats]);

  const reset = () => { setBrand("all"); setAcType("all"); setBtu("all"); setCat("all"); };
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list = mats.filter((m) => {
    // มีคำค้น → ค้นข้ามทุกชนิด (ไม่ยึดแท็บ/ตัวกรอง) เพื่อให้เจอเสมอ · ไม่มีคำค้น → กรองตามแท็บ+ตัวกรอง
    if (terms.length) {
      const h = `${m.th || ""} ${m.en || ""} ${m.code || ""} ${m.brand || ""} ${m.ac_type || ""} ${m.btu || ""} ${m.catName || ""}`.toLowerCase();
      return terms.every((t) => h.includes(t));
    }
    if (m.kind !== kind) return false;
    if (kind === "ac") { if (brand !== "all" && m.brand !== brand) return false; if (acType !== "all" && m.ac_type !== acType) return false; if (btu !== "all" && String(m.btu) !== String(btu)) return false; }
    if (kind === "material" && cat !== "all" && m.cat !== cat) return false;
    return true;
  });
  const shown = list.slice(0, 80);
  const subLine = (m) => m.kind === "ac" ? [m.brand, m.ac_type, m.btu ? fmtNum(m.btu) + " BTU" : null].filter(Boolean).join(" · ") : (m.catName || "");

  function openQty(m) { setQtyModal(m); setModalQty(1); }
  function addFromModal() {
    if (!qtyModal) return;
    onAdd(qtyModal, qtyModal.kind === "material" ? matTarget : undefined, modalQty);
    setQtyModal(null);
  }

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
      <div className="mv-grid ib-cardgrid">
        {shown.length === 0 && <div className="ib-empty" style={{ gridColumn: "1/-1" }}>ไม่พบรายการ</div>}
        {shown.map((m) => (
          <button type="button" className="mv-card" key={m.code} onClick={() => openQty(m)} title="กดเพื่อเพิ่มเข้าเอกสาร">
            <div className="mv-card-photo"><MaterialThumb mat={m} size={108} radius={12} /></div>
            <div className="mv-card-info">
              <div className="mv-card-name">{m.th}</div>
              <div className="mv-card-sub">{m.code}{subLine(m) ? " · " + subLine(m) : ""}</div>
              <div className="mv-card-stock">{fmtBaht2(m.cost)}</div>
            </div>
            <span className="mv-card-add"><UIcon name="plus" size={16} color="#fff" strokeWidth={2.4} /> เพิ่ม</span>
          </button>
        ))}
        {list.length > shown.length && <div className="ib-empty" style={{ gridColumn: "1/-1" }}>…อีก {list.length - shown.length} รายการ — กรอง/ค้นหาเพิ่ม</div>}
      </div>

      {qtyModal && (
        <div className="modal-overlay" onClick={() => setQtyModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <div className="modal-head"><div className="modal-title">เพิ่มเข้าเอกสาร</div>
              <button className="modal-x" onClick={() => setQtyModal(null)}><UIcon name="x" size={18} /></button></div>
            <div className="modal-body">
              <div className="mv-pick-head">
                <MaterialThumb mat={qtyModal} size={64} radius={12} />
                <div><div className="mv-pick-name">{qtyModal.th}</div>
                  <div className="mv-pick-sub">{qtyModal.code}{subLine(qtyModal) ? " · " + subLine(qtyModal) : ""}</div></div>
              </div>
              {qtyModal.kind === "material" && matTargets && (
                <div className="ib-target" style={{ marginBottom: 12 }}><span>เพิ่มเข้า:</span>
                  {matTargets.map((t) => <button key={t.id} className={"ib-target-btn" + (matTarget === t.id ? " on" : "")} onClick={() => setMatTarget(t.id)}>{t.label}</button>)}
                </div>
              )}
              <label className="fld"><span>จำนวน ({unitLbl(qtyModal)})</span>
                <div className="mv-qty-step">
                  <button type="button" onClick={() => setModalQty((x) => Math.max(1, (Number(x) || 1) - 1))}><UIcon name="minus" size={18} /></button>
                  <input type="number" min="1" value={modalQty} onChange={(e) => setModalQty(Math.max(1, Number(e.target.value) || 1))} />
                  <span className="mv-qty-unit">{unitLbl(qtyModal)}</span>
                  <button type="button" onClick={() => setModalQty((x) => (Number(x) || 1) + 1)}><UIcon name="plus" size={18} /></button>
                </div>
              </label>
            </div>
            <div className="modal-foot"><button className="btn-ghost" onClick={() => setQtyModal(null)}>ยกเลิก</button>
              <button className="btn-primary" onClick={addFromModal}><UIcon name="plus" size={15} color="#fff" strokeWidth={2.4} /> เพิ่มเข้าเอกสาร</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
