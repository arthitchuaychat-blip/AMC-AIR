import React from "react";
import { bulkUpsertMaterials } from "../lib/api";
import { UIcon } from "../icons";

// columns (in order): code, name_th, name_en, category, unit, cost, min_stock, init_stock, sale_price, description
const TEMPLATE = "รหัส,ชื่อไทย,ชื่ออังกฤษ,หมวด,หน่วย,ต้นทุน,ขั้นต่ำ,คงเหลือ,ราคาขาย,รายละเอียด\nCOPP8,ท่อทองแดง 1\",Copper Pipe 1\",pipe,เมตร,180,40,0,260,ท่อทองแดงเกรด A หนา 0.7mm";

export default function BulkImportModal({ categories, onDone, onClose }) {
  const [text, setText] = React.useState("");
  const [parsed, setParsed] = React.useState(null); // {rows, errors}
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

  function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setText(String(r.result || ""));
    r.readAsText(f, "utf-8");
  }

  function parse() {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = [], errors = [];
    lines.forEach((line, i) => {
      const delim = line.includes("\t") ? "\t" : ",";
      const cells = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
      const c0 = (cells[0] || "").toLowerCase();
      if (i === 0 && (c0 === "code" || c0 === "รหัส")) return; // header
      const [code, name_th, name_en, cat, unit, cost, min_stock, init_stock, sale_price] = cells;
      const description = cells.slice(9).join(delim); // rejoin remainder so commas in description survive
      if (!code || !name_th) { errors.push({ line: i + 1, reason: "ต้องมีรหัสและชื่อไทย" }); return; }
      const category = cat ? (catMap[cat.toLowerCase()] || catMap[cat.trim()] || null) : null;
      rows.push({
        code: code, name_th, name_en: name_en || name_th,
        category, unit: unit || "ชิ้น",
        cost: Number(cost) || 0, min_stock: Number(min_stock) || 0, init_stock: Number(init_stock) || 0,
        sale_price: Number(sale_price) || 0, description: description?.trim() || null,
      });
    });
    setParsed({ rows, errors });
    setMsg(null);
  }

  async function doImport() {
    if (!parsed?.rows.length || busy) return;
    setBusy(true);
    try { await bulkUpsertMaterials(parsed.rows); onDone(parsed.rows.length); }
    catch (e) { setMsg("นำเข้าไม่สำเร็จ: " + (e.message || e)); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <div className="modal-head">
          <div className="modal-title">นำเข้าวัสดุหลายรายการ <span>Bulk import</span></div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <p className="page-sub" style={{ marginBottom: 8 }}>
            วางข้อมูลจาก Excel/Google Sheets (คัดลอกทั้งหลายแถวมาวางได้เลย) หรืออัปโหลดไฟล์ <b>.csv</b><br />
            ลำดับคอลัมน์: <b>รหัส · ชื่อไทย · ชื่ออังกฤษ · หมวด · หน่วย · ต้นทุน · ขั้นต่ำ · คงเหลือ · ราคาขาย · รายละเอียด</b> (มี/ไม่มีหัวตารางก็ได้)
          </p>
          <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
              <UIcon name="box" size={14} /> เลือกไฟล์ CSV
              <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} style={{ display: "none" }} />
            </label>
            <button className="btn-ghost sm" onClick={() => setText(TEMPLATE)}>ใส่ตัวอย่างรูปแบบ</button>
          </div>
          <textarea className="inp bulk-ta" value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }}
            placeholder={"COPP8,ท่อทองแดง 1\",Copper Pipe 1\",pipe,เมตร,180,40,0\nR32X,น้ำยาแอร์ R32,Refrigerant,ref,ถัง,3600,5,0"} rows={9} />
          {parsed && (
            <div className="bulk-preview">
              ✅ พร้อมนำเข้า <b>{parsed.rows.length}</b> รายการ
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
