import React from "react";
import { UIcon } from "../icons";
import { UNITS } from "../lib/format";
import { uploadMaterialPhoto } from "../lib/api";

const KINDS = [{ v: "material", l: "วัสดุ" }, { v: "ac", l: "เครื่องปรับอากาศ" }, { v: "service", l: "บริการ" }];

// Add OR edit a catalog item (material / ac / service). `initial` null => add mode.
export default function MaterialModal({ initial, categories, brands = [], btus = [], defaultKind = "material", onSaved, onClose, onSave }) {
  const isNew = !initial;
  const [f, setF] = React.useState(() => ({
    code: initial?.code || "",
    name_th: initial?.name_th || initial?.th || "",
    name_en: initial?.name_en || initial?.en || "",
    kind: initial?.kind || defaultKind,
    category: initial?.category || initial?.cat || categories[0]?.id || "pipe",
    brand: initial?.brand || "",
    btu: initial?.btu || "",
    tracked: initial ? (initial.tracked !== false) : (defaultKind !== "service"),
    unit: initial?.unit || "เมตร",
    cost: initial?.cost ?? "",
    sale_price: initial?.salePrice ?? initial?.sale_price ?? "",
    description: initial?.description ?? "",
    photo_url: initial?.photoUrl ?? initial?.photo_url ?? "",
    min_stock: initial?.minStock ?? initial?.min_stock ?? "",
    init_stock: initial?.stock ?? initial?.init_stock ?? "",
  }));
  const [busy, setBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setKind = (kind) => setF((s) => ({ ...s, kind, tracked: kind === "service" ? false : s.tracked }));
  const valid = f.code && f.name_th;
  const isAc = f.kind === "ac", isService = f.kind === "service", isMat = f.kind === "material";

  async function onPhoto(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setErr(null);
    try { const url = await uploadMaterialPhoto(file, f.code); setF((s) => ({ ...s, photo_url: url })); }
    catch (ex) { setErr("อัปโหลดรูปไม่สำเร็จ: " + (ex.message || ex)); }
    setUploading(false);
  }
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
          <div className="modal-title">{isNew ? "เพิ่มรายการใหม่" : "แก้ไขรายการ"} <span>{isNew ? "Add item" : "Edit item"}</span></div>
          <button className="drawer-close" onClick={onClose}><UIcon name="x" size={20} /></button>
        </div>
        <div className="modal-body">
          {/* kind */}
          <div className="sub-toggle" style={{ marginBottom: 14 }}>
            {KINDS.map((k) => <button key={k.v} className={f.kind === k.v ? "on" : ""} onClick={() => setKind(k.v)} disabled={!isNew && f.kind !== k.v}>{k.l}</button>)}
          </div>

          <div className="fld-row">
            <label className="fld"><span>รหัส · Code *</span>
              <input className="inp" value={f.code} onChange={set("code")} placeholder={isAc ? "เช่น DAIKIN-12K" : isService ? "เช่น SVC-INSTALL" : "เช่น COPP8"} disabled={!isNew} />
            </label>
            {isMat && (
              <label className="fld"><span>หมวดย่อย · Category</span>
                <select className="inp" value={f.category} onChange={set("category")}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name_th}</option>)}
                </select>
              </label>
            )}
            {isAc && (
              <label className="fld"><span>ยี่ห้อ · Brand</span>
                <input className="inp" list="brand-list" value={f.brand} onChange={set("brand")} placeholder="เลือก/พิมพ์ยี่ห้อ" />
                <datalist id="brand-list">{brands.map((b) => <option key={b} value={b} />)}</datalist>
              </label>
            )}
          </div>

          <label className="fld"><span>ชื่อรายการ (ไทย) *</span>
            <input className="inp" value={f.name_th} onChange={set("name_th")} placeholder={isAc ? "เช่น แอร์ติดผนัง 12000 BTU" : isService ? "เช่น ค่าติดตั้งแอร์" : "เช่น ท่อทองแดงแบบม้วน 1 นิ้ว"} />
          </label>
          <label className="fld"><span>ชื่อรายการ (English)</span>
            <input className="inp" value={f.name_en} onChange={set("name_en")} placeholder="(ไม่บังคับ)" />
          </label>

          {isAc && (
            <label className="fld"><span>ขนาด BTU</span>
              <input className="inp" type="number" list="btu-list" value={f.btu} onChange={set("btu")} placeholder="เช่น 12000" />
              <datalist id="btu-list">{btus.map((b) => <option key={b} value={b} />)}</datalist>
            </label>
          )}

          <label className="fld"><span>รายละเอียด</span>
            <textarea className="inp" value={f.description} onChange={set("description")} placeholder="คำอธิบาย / สเปก / หมายเหตุ (ไม่บังคับ)" rows={2} style={{ resize: "vertical" }} />
          </label>
          <label className="fld"><span>รูปสินค้า</span>
            <div className="photo-field">
              {f.photo_url ? <img src={f.photo_url} className="photo-thumb" alt="" /> : <div className="photo-thumb empty"><UIcon name="camera" size={22} color="var(--ink-3)" /></div>}
              <div className="photo-actions">
                <label className="btn-ghost sm" style={{ cursor: "pointer" }}>
                  <UIcon name="camera" size={14} /> {uploading ? "กำลังอัปโหลด…" : (f.photo_url ? "เปลี่ยนรูป" : "อัปโหลดรูป")}
                  <input type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} disabled={uploading} />
                </label>
                {f.photo_url && <button className="btn-ghost sm danger" onClick={() => setF((s) => ({ ...s, photo_url: "" }))}>ลบรูป</button>}
              </div>
            </div>
          </label>

          <div className="fld-row3">
            <label className="fld"><span>หน่วย</span>
              <select className="inp" value={f.unit} onChange={set("unit")}>
                {[...new Set([f.unit, ...UNITS, "เครื่อง", "งาน", "ชุด"])].filter(Boolean).map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </label>
            <label className="fld"><span>ต้นทุน/หน่วย</span>
              <input className="inp" type="number" value={f.cost} onChange={set("cost")} placeholder="0.00" />
            </label>
            <label className="fld"><span>ราคาขาย/หน่วย</span>
              <input className="inp" type="number" value={f.sale_price} onChange={set("sale_price")} placeholder="0.00" />
            </label>
          </div>

          {/* stock tracking (not for service) */}
          {!isService && (
            <label className="fld"><span>การนับสต๊อก</span>
              <button type="button" className={"vat-toggle" + (f.tracked ? " on" : "")} onClick={() => setF((s) => ({ ...s, tracked: !s.tracked }))}>
                {f.tracked ? "นับสต๊อก (เบิก/คืน/ซื้อได้)" : "ไม่นับสต๊อก (สั่งตามงาน)"}
              </button>
            </label>
          )}
          {!isService && f.tracked && (
            <div className="fld-row">
              <label className="fld"><span>จำนวนขั้นต่ำ</span>
                <input className="inp" type="number" value={f.min_stock} onChange={set("min_stock")} placeholder="0" />
              </label>
              {isNew && (
                <label className="fld"><span>คงเหลือเริ่มต้น</span>
                  <input className="inp" type="number" value={f.init_stock} onChange={set("init_stock")} placeholder="0" />
                </label>
              )}
            </div>
          )}
          {!isNew && !isService && f.tracked && (
            <p className="page-sub" style={{ marginTop: 4 }}>* ยอดคงเหลือปรับผ่านเบิก/คืน/ซื้อ/ตัดเสียเท่านั้น (คำนวณอัตโนมัติ)</p>
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
