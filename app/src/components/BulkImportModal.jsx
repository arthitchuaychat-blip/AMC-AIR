import React from "react";
import { bulkUpsertMaterials, saveBrand, saveBtu, saveCategory } from "../lib/api";
import { UIcon } from "../icons";

// New unified format (12 cols):
// ชนิด · รหัส · ชื่อไทย · ชื่ออังกฤษ · หมวด/ยี่ห้อ · BTU · หน่วย · ต้นทุน · ขั้นต่ำ · คงเหลือ · ราคาขาย · รายละเอียด
//   ชนิด = แอร์/วัสดุ/บริการ (ac/material/service)
//   คอลัมน์ "หมวด/ยี่ห้อ" = หมวด(วัสดุ) หรือ ยี่ห้อ(แอร์) · BTU ใช้เฉพาะแอร์
const HEADER = "ชนิด,รหัส,ชื่อไทย,ชื่ออังกฤษ,หมวด/ยี่ห้อ,BTU,หน่วย,ต้นทุน,ขั้นต่ำ,คงเหลือ,ราคาขาย,รายละเอียด";
const SAMPLE_ROWS = [
  "แอร์,DKN12,แอร์ Daikin 12000 BTU,Daikin 12000,Daikin,12000,เครื่อง,11000,2,0,15900,อินเวอร์เตอร์ เบอร์ 5",
  "วัสดุ,COPP6,ท่อทองแดง 6 หุน,Copper Pipe,pipe,,เมตร,180,40,0,260,เกรด A",
  "บริการ,SVCINST,ค่าติดตั้งแอร์,Install,,,งาน,0,0,0,1500,ติดตั้งมาตรฐานต่อชุด",
];
const TEMPLATE = [HEADER, ...SAMPLE_ROWS].join("\n");

const KIND_MAP = {
  "แอร์": "ac", "เครื่องปรับอากาศ": "ac", "ac": "ac",
  "วัสดุ": "material", "วัสดุสิ้นเปลือง": "material", "material": "material", "mat": "material",
  "บริการ": "service", "service": "service", "svc": "service",
};
const KIND_TH = { ac: "แอร์", material: "วัสดุ", service: "บริการ" };
const detectKind = (cell) => KIND_MAP[(cell || "").trim().toLowerCase()] || null;
const defUnit = (kind) => (kind === "ac" ? "เครื่อง" : kind === "service" ? "งาน" : "ชิ้น");

// split one row into cells. Tab-delimited (pasted from Sheets) → simple split.
// Comma (CSV) → quote-aware parser so names with commas like "9,000-36,000 BTU" stay intact.
function splitCells(line) {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim().replace(/^"|"$/g, ""));
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export default function BulkImportModal({ categories, onDone, onClose }) {
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState(null); // {rows, errors, counts}
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  // category lookup by id or thai name
  const catMap = React.useMemo(() => {
    const m = {};
    categories.forEach((c) => { m[c.id.toLowerCase()] = c.id; m[(c.name_th || "").trim()] = c.id; });
    return m;
  }, [categories]);
  const resolveCat = (v) => v ? (catMap[v.toLowerCase()] || catMap[v.trim()] || null) : null;

  function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ""));
    r.readAsText(f, "utf-8");
  }

  function downloadTemplate() {
    const blob = new Blob(["﻿" + TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "amc-import-template.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function parse() {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = [], errors = [];
    const counts = { ac: 0, material: 0, service: 0 };
    lines.forEach((line, i) => {
      const cells = splitCells(line);
      const c0 = (cells[0] || "").toLowerCase();
      if (i === 0 && (c0 === "ชนิด" || c0 === "kind" || c0 === "รหัส" || c0 === "code")) return; // header

      const kindFromCol = detectKind(cells[0]);
      let kind, code, name_th, name_en, catBrand, btu, unit, cost, min_stock, init_stock, sale_price, description;
      if (kindFromCol) {
        // new format: kind in column 1
        kind = kindFromCol;
        [, code, name_th, name_en, catBrand, btu, unit, cost, min_stock, init_stock, sale_price] = cells;
        description = cells.slice(11).join(",");
      } else {
        // backward-compatible: old material-only format (no kind column)
        kind = "material";
        [code, name_th, name_en, catBrand, unit, cost, min_stock, init_stock, sale_price] = cells;
        btu = null;
        description = cells.slice(9).join(",");
      }

      if (!code || !name_th) { errors.push({ line: i + 1, reason: "ต้องมีรหัสและชื่อไทย" }); return; }
      const isService = kind === "service";
      rows.push({
        code, name_th, name_en: name_en || name_th, kind,
        category: kind === "material" ? resolveCat(catBrand) : null,
        _catRaw: kind === "material" ? (catBrand?.trim() || "") : "",
        brand: kind === "ac" ? (catBrand?.trim() || null) : null,
        btu: kind === "ac" && btu ? Number(btu) : null,
        tracked: isService ? false : true,
        unit: unit || defUnit(kind),
        cost: Number(cost) || 0,
        sale_price: Number(sale_price) || 0,
        min_stock: isService ? 0 : (Number(min_stock) || 0),
        init_stock: isService ? 0 : (Number(init_stock) || 0),
        description: description?.trim() || null,
      });
      counts[kind] = (counts[kind] || 0) + 1;
    });
    setParsed({ rows, errors, counts });
    setMsg(null);
  }

  async function doImport() {
    if (!parsed?.rows.length || busy) return;
    setBusy(true);
    try {
      // auto-create categories for material rows whose หมวด text didn't match an existing one
      const matRows = parsed.rows.filter((r) => r.kind === "material");
      const need = [...new Set(matRows.filter((r) => !r.category && r._catRaw).map((r) => r._catRaw))];
      if (need.length) {
        const usedIds = new Set(categories.map((c) => c.id));
        const slug = (s) => { let base = s.trim().toLowerCase().replace(/[^a-z0-9ก-๙]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "cat"; let id = base, n = 2; while (usedIds.has(id)) id = `${base}-${n++}`; usedIds.add(id); return id; };
        const newMap = {};
        for (const t of need) { const id = slug(t); try { await saveCategory({ id, name_th: t, name_en: "" }); newMap[t] = id; } catch { /* ignore */ } }
        matRows.forEach((r) => { if (!r.category && r._catRaw && newMap[r._catRaw]) r.category = newMap[r._catRaw]; });
      }
      // upsert materials (strip the helper field)
      await bulkUpsertMaterials(parsed.rows.map(({ _catRaw, ...r }) => r));
      // register any new brands / BTUs from imported AC rows (so they show in filters)
      const brands = [...new Set(parsed.rows.filter((r) => r.kind === "ac" && r.brand).map((r) => r.brand))];
      const btus = [...new Set(parsed.rows.filter((r) => r.kind === "ac" && r.btu).map((r) => r.btu))];
      for (const b of brands) { try { await saveBrand(b); } catch { /* ignore dup */ } }
      for (const b of btus) { try { await saveBtu(b); } catch { /* ignore dup */ } }
      onDone(parsed.rows.length);
    } catch (e) { setMsg("นำเข้าไม่สำเร็จ: " + (e.message || e)); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 680 }}>
        <div className="modal-head">
          <div className="modal-title">นำเข้าหลายรายการ <span>แอร์ · วัสดุ · บริการ</span></div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="page-sub" style={{ marginBottom: 8 }}>
            วางข้อมูลจาก Excel/Google Sheets (หลายแถวพร้อมกัน) หรืออัปโหลดไฟล์ <b>.csv</b> — ใส่ <b>แอร์ · วัสดุ · บริการ</b> รวมกันได้<br />
            ลำดับคอลัมน์: <b>ชนิด · รหัส · ชื่อไทย · ชื่ออังกฤษ · หมวด/ยี่ห้อ · BTU · หน่วย · ต้นทุน · ขั้นต่ำ · คงเหลือ · ราคาขาย · รายละเอียด</b>
          </p>
          <ul className="bulk-help">
            <li><b>ชนิด</b> = แอร์ / วัสดุ / บริการ</li>
            <li><b>หมวด/ยี่ห้อ</b> = ใส่ "หมวด" ถ้าเป็นวัสดุ (ถ้ายังไม่มีหมวดนี้ ระบบสร้างให้อัตโนมัติ) · ใส่ "ยี่ห้อ" ถ้าเป็นแอร์ · บริการเว้นว่าง</li>
            <li><b>BTU</b> = เฉพาะแอร์ · <b>บริการ</b> ไม่ต้องใส่สต๊อก (ขั้นต่ำ/คงเหลือเว้นว่างได้)</li>
          </ul>
          <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <button className="btn-ghost sm" onClick={downloadTemplate}><UIcon name="withdraw" size={14} /> ดาวน์โหลดฟอร์ม CSV</button>
            <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
              <UIcon name="box" size={14} /> เลือกไฟล์ CSV
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} style={{ display: "none" }} />
            </label>
            <button className="btn-ghost sm" onClick={() => { setText(TEMPLATE); setParsed(null); }}>ใส่ตัวอย่างรูปแบบ</button>
          </div>
          <textarea className="inp bulk-ta" value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }}
            placeholder={SAMPLE_ROWS.join("\n")} rows={9} />
          {parsed && (
            <div className="bulk-preview">
              ✅ พร้อมนำเข้า <b>{parsed.rows.length}</b> รายการ
              {(parsed.counts.ac > 0 || parsed.counts.material > 0 || parsed.counts.service > 0) &&
                <span style={{ color: "var(--ink-3)" }}> · แอร์ {parsed.counts.ac} · วัสดุ {parsed.counts.material} · บริการ {parsed.counts.service}</span>}
              {parsed.errors.length > 0 && <span style={{ color: "var(--down)" }}> · ข้าม {parsed.errors.length} แถว (รหัส/ชื่อไม่ครบ)</span>}
            </div>
          )}
          {msg && <div className="login-err" style={{ marginTop: 8 }}>{msg}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          {!parsed
            ? <button className="btn-primary" disabled={!text.trim()} onClick={parse}>ตรวจสอบข้อมูล</button>
            : <button className="btn-primary" disabled={!parsed.rows.length || busy} onClick={doImport}>
                <UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {busy ? "กำลังนำเข้า…" : `นำเข้า ${parsed.rows.length} รายการ`}
              </button>}
        </div>
      </div>
    </div>
  );
}
