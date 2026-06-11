import React from "react";
import { UIcon } from "../icons";
import { UNITS } from "../lib/format";

// Add OR edit a material. `initial` null => add mode.
export default function MaterialModal({ initial, categories, onSaved, onClose, onSave }) {
  const isNew = !initial;
  const [f, setF] = React.useState(() => ({
    code: initial?.code || "",
    name_th: initial?.name_th || initial?.th || "",
    name_en: initial?.name_en || initial?.en || "",
    category: initial?.category || initial?.cat || categories[0]?.id || "pipe",
    unit: initial?.unit || "เมตร",
    cost: initial?.cost ?? "",
    sale_price: initial?.salePrice ?? initial?.sale_price ?? "",
    description: initial?.description ?? "",
    min_stock: initial?.minStock ?? initial?.min_stock ?? "",
    init_stock: initial?.stock ?? initial?.init_stock ?? "",
  }));
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const valid = f.code && f.name_th && f.cost !== "";

  React.useEffect(() => {
    const esc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  async function submit() {
    if (!valid || busy) return;
    setBusy(true); setErr(null);
    try { await onSave(f, isNew); onSaved(); }
    catch (e) { setErr(e.message || String(e)); setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">{isNew ? "เพิ่มวัสดุใหม่" : "แก้ไขข้อมูลวัสดุ"} <span>{isNew ? "Add material" : "Edit material"}</span></div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          <div className="fld-row">
            <label className="fld"><span>รหัส · Code *</span>
              <input className="inp" value={f.code} onChange={set("code")} placeholder="เช่น COPP8" disabled={!isNew} />
            </label>
            <label className="fld"><span>หมวด · Category</span>
              <select className="inp" value={f.category} onChange={set("category")}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
              </select>
            </label>
          </div>
          <label className="fld"><span>ชื่อวัสดุ (ไทย) *</span>
            <input className="inp" value={f.name_th} onChange={set("name_th")} placeholder="เช่น ท่อทองแดงแบบม้วน 1 นิ้ว" />
          </label>
          <label className="fld"><span>ชื่อวัสดุ (English)</span>
            <input className="inp" value={f.name_en} onChange={set("name_en")} placeholder="Copper Coil 1&quot;" />
          </label>
          <label className="fld"><span>รายละเอียดสินค้า</span>
            <textarea className="inp" value={f.description} onChange={set("description")} placeholder="คำอธิบาย / สเปก / หมายเหตุ (ไม่บังคับ)" rows={2} style={{ resize: "vertical" }} />
          </label>
          <div className="fld-row3">
            <label className="fld"><span>หน่วย</span>
              <select className="inp" value={f.unit} onChange={set("unit")}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="fld"><span>ต้นทุน/หน่วย *</span>
              <input className="inp" type="number" value={f.cost} onChange={set("cost")} placeholder="0.00" />
            </label>
            <label className="fld"><span>ราคาขาย/หน่วย</span>
              <input className="inp" type="number" value={f.sale_price} onChange={set("sale_price")} placeholder="0.00" />
            </label>
          </div>
          <label className="fld"><span>จำนวนขั้นต่ำ</span>
            <input className="inp" type="number" value={f.min_stock} onChange={set("min_stock")} placeholder="0" />
          </label>
          {isNew && (
            <label className="fld"><span>จำนวนคงเหลือเริ่มต้น</span>
              <input className="inp" type="number" value={f.init_stock} onChange={set("init_stock")} placeholder="0" />
            </label>
          )}
          {!isNew && (
            <p className="page-sub" style={{ marginTop: 4 }}>
              * ยอดคงเหลือปรับผ่านการ "เบิก/คืน/ซื้อ/ตัดเสีย" เท่านั้น (คำนวณอัตโนมัติ) จึงแก้ตรงนี้ไม่ได้
            </p>
          )}
          {err && <div className="login-err" style={{ marginTop: 10 }}>{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn-primary" disabled={!valid || busy} onClick={submit}>
            <UIcon name="check" size={16} color="#fff" strokeWidth={2.4} /> {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
